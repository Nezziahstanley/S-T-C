import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_PUBLISHABLE_KEY,
  STC_ADMIN_EMAIL,
  STC_PUBLIC_URL,
  PAYSTACK_SECRET_KEY
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
const authClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY || SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://api.paystack.co"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "12mb", verify: (req, _res, buffer) => { if (req.originalUrl === "/api/paystack/webhook") req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });
const enquiryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
app.use("/api", apiLimiter);
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

const clean = value => typeof value === "string" ? value.trim() : "";
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const adminEmail = clean(STC_ADMIN_EMAIL).toLowerCase();

async function verifiedUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

async function requireUser(req, res, next) {
  const user = await verifiedUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in to continue." });
  req.user = user;
  next();
}

async function requireStaff(req, res, next) {
  const user = await verifiedUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in to continue." });
  const email = clean(user.email).toLowerCase();
  if (adminEmail && email === adminEmail) {
    req.user = user;
    req.staffRole = "super_admin";
    return next();
  }
  const { data, error } = await db.from("stc_staff_roles")
    .select("role,is_active").eq("user_id", user.id).maybeSingle();
  if (error || !data?.is_active) return res.status(403).json({ error: "Staff access is required." });
  req.user = user;
  req.staffRole = data.role;
  next();
}

const roleResources = {
  manager: new Set(["enquiries", "projects", "quotes", "invoices", "payments", "tickets", "services", "posts", "portfolio", "media", "profiles", "enrollments"]),
  project_manager: new Set(["enquiries", "projects", "tickets"]),
  finance: new Set(["quotes", "invoices", "payments"]),
  support: new Set(["enquiries", "tickets"]),
  content_editor: new Set(["services", "posts", "portfolio", "media"])
};
function staffCan(req, resource) {
  return req.staffRole === "super_admin" || Boolean(roleResources[req.staffRole]?.has(resource));
}

function sendError(res, error, status = 400) {
  console.error(error);
  return res.status(status).json({ error: error?.message || "Something went wrong." });
}

async function audit(user, action, entity, entityId, details = {}) {
  const { error } = await db.from("stc_audit_logs").insert({
    actor: user.id, action, entity, entity_id: entityId ? String(entityId) : null, details
  });
  if (error) console.error("Audit log failed:", error.message);
}

app.get("/api/health", (_req, res) => res.json({
  ok: true, service: "Stanley Tech Connect", version: "2.0.0"
}));

app.post("/api/paystack/webhook", async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) return res.sendStatus(503);
  const signature = req.headers["x-paystack-signature"];
  if (typeof signature !== "string" || !req.rawBody) return res.sendStatus(401);
  const expected = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(req.rawBody).digest("hex");
  const supplied = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (supplied.length !== expectedBytes.length || !crypto.timingSafeEqual(supplied, expectedBytes)) return res.sendStatus(401);

  const event = req.body;
  if (event?.event !== "charge.success" || !event?.data?.reference) return res.sendStatus(200);
  const reference = clean(event.data.reference);
  const { data: payment, error: lookupError } = await db.from("stc_payments")
    .select("*").eq("reference", reference).maybeSingle();
  if (lookupError) return res.sendStatus(500);
  if (!payment || payment.status === "success") return res.sendStatus(200);

  const expectedAmount = Math.round(Number(payment.amount) * 100);
  if (event.data.status !== "success" || event.data.amount !== expectedAmount ||
      event.data.currency !== payment.currency || event.data.reference !== reference) return res.sendStatus(200);

  const verifiedAt = new Date().toISOString();
  const { error: paymentError } = await db.from("stc_payments").update({
    status: "success", verified_by: "paystack_webhook", verified_at: verifiedAt,
    gateway_reference: reference
  }).eq("id", payment.id).neq("status", "success");
  if (paymentError) return res.sendStatus(500);

  if (payment.invoice_id) {
    const { error: invoiceError } = await db.from("stc_invoices")
      .update({ status: "paid" }).eq("id", payment.invoice_id)
      .eq("client_user_id", payment.client_user_id);
    if (invoiceError) return res.sendStatus(500);
  }
  if (payment.client_user_id) {
    const { error: noticeError } = await db.from("stc_notifications").insert({
      user_id: payment.client_user_id,
      title: "Payment confirmed",
      body: "Your payment " + reference + " has been confirmed."
    });
    if (noticeError) console.error("Payment notification failed:", noticeError.message);
  }
  return res.sendStatus(200);
});

// Public website content
app.get("/api/public/services", async (_req, res) => {
  const { data, error } = await db.from("stc_services")
    .select("id,slug,name,summary,description").eq("active", true).order("sort_order");
  if (error) return sendError(res, error, 500);
  res.json({ services: data || [] });
});
app.get("/api/public/portfolio", async (_req, res) => {
  const { data, error } = await db.from("stc_portfolio")
    .select("id,title,slug,category,summary,details,url,featured").order("featured", { ascending: false });
  if (error) return sendError(res, error, 500);
  res.json({ portfolio: data || [] });
});
app.get("/api/public/posts", async (_req, res) => {
  const { data, error } = await db.from("stc_posts")
    .select("id,title,slug,excerpt,body,published_at").eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) return sendError(res, error, 500);
  res.json({ posts: data || [] });
});
app.get("/api/public/media", async (_req, res) => {
  const { data, error } = await db.from("stc_media")
    .select("id,title,description,category,media_type,storage_key,is_featured")
    .eq("is_published", true).order("is_featured", { ascending: false });
  if (error) return sendError(res, error, 500);
  const media = (data || []).map(item => ({
    ...item, url: db.storage.from("stc-media").getPublicUrl(item.storage_key).data.publicUrl
  }));
  res.json({ media });
});

// Public enquiries
app.post("/api/enquiries", enquiryLimiter, async (req, res) => {
  const name = clean(req.body?.name);
  const email = clean(req.body?.email).toLowerCase();
  const phone = clean(req.body?.phone);
  const service = clean(req.body?.service);
  const subject = clean(req.body?.subject);
  const message = clean(req.body?.message);
  if (!name || !validEmail(email) || !service || !message) {
    return res.status(400).json({ error: "Enter your name, valid email, service and message." });
  }
  if (name.length > 120 || email.length > 254 || phone.length > 40 ||
      service.length > 120 || subject.length > 180 || message.length > 4000) {
    return res.status(400).json({ error: "One or more fields are too long." });
  }
  const { data, error } = await db.from("stc_enquiries").insert({
    name, email, phone: phone || null, service, subject: subject || service, message
  }).select("id").single();
  if (error) return sendError(res, error, 500);
  res.status(201).json({
    message: "Your enquiry has reached Stanley Tech Connect. We'll be in touch.",
    reference: data.id
  });
});

// Email OTP authentication
app.post("/api/auth/request-code", authLimiter, async (req, res) => {
  const email = clean(req.body?.email).toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const { error } = await authClient.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return sendError(res, error, 400);
  res.json({ message: "Your six-digit sign-in code has been sent. Check your inbox and spam folder." });
});
app.post("/api/auth/verify-code", authLimiter, async (req, res) => {
  const email = clean(req.body?.email).toLowerCase();
  const token = clean(req.body?.token).replace(/\s/g, "");
  if (!validEmail(email) || !/^\d{6}$/.test(token)) {
    return res.status(400).json({ error: "Enter your email and six-digit code." });
  }
  const { data, error } = await authClient.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data?.session?.access_token || !data?.user) {
    return sendError(res, error || new Error("The code is invalid or expired."), 400);
  }
  const user = data.user;
  const { error: profileError } = await db.from("stc_profiles").upsert({
    user_id: user.id, full_name: clean(user.user_metadata?.full_name) || email.split("@")[0]
  }, { onConflict: "user_id", ignoreDuplicates: true });
  if (profileError) console.error("Profile setup:", profileError.message);
  const isAdmin = Boolean(adminEmail && email === adminEmail);
  const { data: staff } = await db.from("stc_staff_roles")
    .select("role,is_active").eq("user_id", user.id).maybeSingle();
  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: { id: user.id, email: user.email },
    role: isAdmin ? "super_admin" : (staff?.is_active ? staff.role : "client"),
    is_admin: isAdmin
  });
});
app.get("/api/auth/me", requireUser, async (req, res) => {
  const { data: profile } = await db.from("stc_profiles")
    .select("full_name,phone,company,account_type,institution,department,study_level,student_number").eq("user_id", req.user.id).maybeSingle();
  const email = clean(req.user.email).toLowerCase();
  const isAdmin = Boolean(adminEmail && email === adminEmail);
  const { data: staff } = await db.from("stc_staff_roles")
    .select("role,is_active").eq("user_id", req.user.id).maybeSingle();
  res.json({
    user: { id: req.user.id, email: req.user.email }, profile,
    role: isAdmin ? "super_admin" : (staff?.is_active ? staff.role : "client"),
    is_admin: isAdmin
  });
});

// Client portal
app.get("/api/client/dashboard", requireUser, async (req, res) => {
  const uid = req.user.id;
  const results = await Promise.all([
    db.from("stc_profiles").select("full_name,phone,company").eq("user_id", uid).maybeSingle(),
    db.from("stc_projects").select("*").eq("client_user_id", uid).order("created_at", { ascending: false }),
    db.from("stc_quotes").select("*").eq("client_user_id", uid).order("created_at", { ascending: false }),
    db.from("stc_invoices").select("*").eq("client_user_id", uid).order("created_at", { ascending: false }),
    db.from("stc_payments").select("id,invoice_id,reference,amount,currency,method,status,transaction_reference,receipt_submitted_at,rejection_reason,created_at").eq("client_user_id", uid).order("created_at", { ascending: false }),
    db.from("stc_tickets").select("*").eq("client_user_id", uid).order("created_at", { ascending: false }),
    db.from("stc_notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(30),
    db.from("stc_training_enrollments").select("*").eq("user_id", uid).order("created_at", { ascending: false })
  ]);
  const error = results.find(item => item.error)?.error;
  if (error) return sendError(res, error, 500);
  const [profile, projects, quotes, invoices, payments, tickets, notifications, enrollments] = results;
  res.json({
    profile: profile.data || {}, projects: projects.data || [], quotes: quotes.data || [],
    invoices: invoices.data || [], payments: payments.data || [],
    tickets: tickets.data || [], notifications: notifications.data || [], enrollments: enrollments.data || []
  });
});
app.patch("/api/client/profile", requireUser, async (req, res) => {
  const full_name = clean(req.body?.full_name);
  const phone = clean(req.body?.phone);
  const company = clean(req.body?.company);
  if (!full_name || full_name.length > 120 || phone.length > 40 || company.length > 160) {
    return res.status(400).json({ error: "Check your profile details." });
  }
  const { error } = await db.from("stc_profiles")
    .upsert({ user_id: req.user.id, full_name, phone, company }, { onConflict: "user_id" });
  if (error) return sendError(res, error, 500);
  res.json({ message: "Profile updated." });
});
app.post("/api/client/tickets", requireUser, async (req, res) => {
  const subject = clean(req.body?.subject);
  const message = clean(req.body?.message);
  const priority = ["low", "normal", "high"].includes(req.body?.priority) ? req.body.priority : "normal";
  if (!subject || !message || subject.length > 180 || message.length > 4000) {
    return res.status(400).json({ error: "Enter a subject and message." });
  }
  const { data, error } = await db.from("stc_tickets")
    .insert({ client_user_id: req.user.id, subject, message, priority }).select("id").single();
  if (error) return sendError(res, error, 500);
  const { error: messageError } = await db.from("stc_messages").insert({
    ticket_id: data.id, sender_user_id: req.user.id, message
  });
  if (messageError) console.error("Ticket first message:", messageError.message);
  res.status(201).json({ message: "Support ticket created.", id: data.id });
});
app.get("/api/client/tickets/:id/messages", requireUser, async (req, res) => {
  const id = Number(req.params.id);
  const { data: ticket } = await db.from("stc_tickets").select("id")
    .eq("id", id).eq("client_user_id", req.user.id).maybeSingle();
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });
  const { data, error } = await db.from("stc_messages")
    .select("id,sender_user_id,message,created_at").eq("ticket_id", id).order("created_at");
  if (error) return sendError(res, error, 500);
  res.json({ messages: data || [] });
});
app.post("/api/client/tickets/:id/messages", requireUser, async (req, res) => {
  const id = Number(req.params.id);
  const message = clean(req.body?.message);
  if (!message || message.length > 4000) return res.status(400).json({ error: "Enter a message." });
  const { data: ticket } = await db.from("stc_tickets").select("id,status")
    .eq("id", id).eq("client_user_id", req.user.id).maybeSingle();
  if (!ticket || ticket.status === "closed") return res.status(404).json({ error: "Ticket unavailable or closed." });
  const { error } = await db.from("stc_messages").insert({
    ticket_id: id, sender_user_id: req.user.id, message
  });
  if (error) return sendError(res, error, 500);
  res.status(201).json({ message: "Reply sent." });
});
app.patch("/api/client/notifications/:id/read", requireUser, async (req, res) => {
  const { error } = await db.from("stc_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", Number(req.params.id)).eq("user_id", req.user.id);
  if (error) return sendError(res, error, 500);
  res.json({ message: "Notification marked as read." });
});

// Paystack payment initialization and verification
app.post("/api/client/invoices/:id/pay", requireUser, async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) return res.status(503).json({ error: "Online payments are awaiting Paystack configuration." });
  const { data: invoice } = await db.from("stc_invoices").select("*")
    .eq("id", Number(req.params.id)).eq("client_user_id", req.user.id).maybeSingle();
  if (!invoice) return res.status(404).json({ error: "Invoice not found." });
  if (invoice.status === "paid") return res.status(409).json({ error: "Invoice already paid." });
  const amount = Math.round(Number(invoice.amount) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) return res.status(400).json({ error: "Invoice amount is invalid." });
  const reference = "STC-" + crypto.randomUUID().replace(/-/g, "").toUpperCase();
  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: req.user.email, amount, currency: invoice.currency || "NGN", reference,
      callback_url: (STC_PUBLIC_URL || "").replace(/\/$/, "") + "/?payment=verify",
      metadata: { invoice_id: invoice.id, client_user_id: req.user.id }
    })
  });
  const paystack = await paystackResponse.json();
  if (!paystackResponse.ok || !paystack.status || !paystack.data?.authorization_url) {
    return res.status(502).json({ error: paystack.message || "Paystack could not initialize this payment." });
  }
  const { error } = await db.from("stc_payments").insert({
    invoice_id: invoice.id, client_user_id: req.user.id, reference,
    amount: invoice.amount, currency: invoice.currency || "NGN",
    method: "paystack", status: "pending", gateway_reference: reference
  });
  if (error) return sendError(res, error, 500);
  res.json({ authorization_url: paystack.data.authorization_url, reference });
});
app.get("/api/client/payments/verify", requireUser, async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) return res.status(503).json({ error: "Online payments are not configured." });
  const reference = clean(req.query.reference);
  if (!reference || reference.length > 100) return res.status(400).json({ error: "Invalid payment reference." });
  const { data: payment } = await db.from("stc_payments").select("*")
    .eq("reference", reference).eq("client_user_id", req.user.id).maybeSingle();
  if (!payment) return res.status(404).json({ error: "Payment record not found." });
  const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY }
  });
  const result = await response.json();
  if (!response.ok || !result.status || result.data?.status !== "success") {
    return res.status(400).json({ error: "Paystack has not confirmed this payment." });
  }
  const expected = Math.round(Number(payment.amount) * 100);
  if (result.data.amount !== expected || result.data.currency !== payment.currency || result.data.reference !== reference) {
    return res.status(400).json({ error: "Verified payment does not match the invoice amount and currency." });
  }
  const { error } = await db.from("stc_payments").update({
    status: "success", verified_by: "paystack", verified_at: new Date().toISOString(),
    gateway_reference: reference
  }).eq("id", payment.id);
  if (error) return sendError(res, error, 500);
  if (payment.invoice_id) await db.from("stc_invoices").update({ status: "paid" })
    .eq("id", payment.invoice_id).eq("client_user_id", req.user.id);
  res.json({ message: "Payment verified successfully.", reference });
});

// CEO and staff workspace
app.get("/api/admin/dashboard", requireStaff, async (req, res) => {
  if (!["super_admin", "manager"].includes(req.staffRole)) {
    return res.status(403).json({ error: "Your staff role does not have access to the management overview." });
  }
  const results = await Promise.all([
    db.from("stc_enquiries").select("id", { count: "exact", head: true }),
    db.from("stc_projects").select("id", { count: "exact", head: true }),
    db.from("stc_invoices").select("id", { count: "exact", head: true }),
    db.from("stc_tickets").select("id", { count: "exact", head: true }),
    db.from("stc_payments").select("id", { count: "exact", head: true }),
    db.from("stc_enquiries").select("*").order("created_at", { ascending: false }).limit(8),
    db.from("stc_projects").select("*").order("created_at", { ascending: false }).limit(8),
    db.from("stc_tickets").select("*").order("created_at", { ascending: false }).limit(8)
  ]);
  const error = results.find(item => item.error)?.error;
  if (error) return sendError(res, error, 500);
  res.json({
    role: req.staffRole,
    metrics: {
      enquiries: results[0].count || 0, projects: results[1].count || 0,
      invoices: results[2].count || 0, tickets: results[3].count || 0,
      payments: results[4].count || 0
    },
    enquiries: results[5].data || [], projects: results[6].data || [], tickets: results[7].data || []
  });
});

const adminTables = {
  enquiries: "stc_enquiries", projects: "stc_projects", quotes: "stc_quotes",
  invoices: "stc_invoices", payments: "stc_payments", tickets: "stc_tickets",
  services: "stc_services", posts: "stc_posts", portfolio: "stc_portfolio",
  media: "stc_media", profiles: "stc_profiles", staff: "stc_staff_roles"
};
app.get("/api/admin/:resource", requireStaff, async (req, res) => {
  const table = adminTables[req.params.resource];
  if (!table) return res.status(404).json({ error: "Unknown admin resource." });
  if (!staffCan(req, req.params.resource)) return res.status(403).json({ error: "Your staff role cannot access this section." });
  const { data, error } = await db.from(table).select("*").limit(100);
  if (error) return sendError(res, error, 500);
  res.json({ items: data || [] });
});
app.post("/api/admin/:resource", requireStaff, async (req, res) => {
  const resource = req.params.resource;
  const table = adminTables[resource];
  if (!table || ["enquiries", "payments", "profiles", "media"].includes(resource)) {
    return res.status(403).json({ error: "This resource cannot be created here." });
  }
  if (resource === "staff") {
    if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can manage staff roles." });
    const user_id = clean(req.body?.user_id);
    const role = clean(req.body?.role);
    const allowed = ["manager", "project_manager", "finance", "support", "content_editor"];
    if (!user_id || !allowed.includes(role)) return res.status(400).json({ error: "Enter a valid Supabase user ID and staff role." });
    const { data, error } = await db.from("stc_staff_roles").upsert({ user_id, role, is_active: true }, { onConflict: "user_id" }).select("*").single();
    if (error) return sendError(res, error, 400);
    await audit(req.user, "assign_staff_role", "staff", user_id, { role });
    return res.status(201).json({ item: data });
  }
  if (!staffCan(req, resource)) return res.status(403).json({ error: "Your staff role cannot create records in this section." });
  const fields = {
    projects: ["client_user_id", "title", "description", "service", "status", "progress", "start_date", "due_date"],
    quotes: ["client_user_id", "enquiry_id", "reference", "title", "description", "amount", "currency", "status", "valid_until"],
    invoices: ["client_user_id", "project_id", "quote_id", "reference", "description", "amount", "currency", "status", "due_date"],
    tickets: ["client_user_id", "subject", "message", "status", "priority"],
    services: ["slug", "name", "summary", "description", "active", "sort_order"],
    posts: ["title", "slug", "excerpt", "body", "status", "published_at"],
    portfolio: ["title", "slug", "category", "summary", "details", "url", "featured"]
  }[resource];
  const payload = Object.fromEntries(fields.filter(key => req.body?.[key] !== undefined).map(key => [key, req.body[key]]));
  if (["projects", "quotes", "invoices", "tickets"].includes(resource) && !payload.client_user_id) {
    return res.status(400).json({ error: "A client user ID is required." });
  }
  const { data, error } = await db.from(table).insert(payload).select("*").single();
  if (error) return sendError(res, error, 400);
  await audit(req.user, "create", resource, data.id, { fields: Object.keys(payload) });
  res.status(201).json({ item: data });
});
app.patch("/api/admin/:resource/:id", requireStaff, async (req, res) => {
  const resource = req.params.resource;
  const table = adminTables[resource];
  if (!table || resource === "profiles") return res.status(403).json({ error: "This resource cannot be edited here." });
  if (resource === "staff") {
    if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can manage staff roles." });
    const payload = {};
    if (["manager", "project_manager", "finance", "support", "content_editor"].includes(req.body?.role)) payload.role = req.body.role;
    if (typeof req.body?.is_active === "boolean") payload.is_active = req.body.is_active;
    if (!Object.keys(payload).length) return res.status(400).json({ error: "No valid staff fields supplied." });
    const { data, error } = await db.from("stc_staff_roles").update(payload).eq("user_id", req.params.id).select("*").maybeSingle();
    if (error) return sendError(res, error, 400);
    if (!data) return res.status(404).json({ error: "Staff record not found." });
    await audit(req.user, "update_staff_role", "staff", req.params.id, payload);
    return res.json({ item: data });
  }
  if (!staffCan(req, resource)) return res.status(403).json({ error: "Your staff role cannot edit this section." });
  const editable = {
    enrollments: ["status", "supervisor", "study_level", "placement_duration"], enquiries: ["status"], projects: ["title", "description", "service", "status", "progress", "start_date", "due_date"],
    quotes: ["title", "description", "amount", "currency", "status", "valid_until"],
    invoices: ["description", "amount", "currency", "status", "due_date"],
    tickets: ["status", "priority"],
    services: ["name", "summary", "description", "active", "sort_order"],
    posts: ["title", "excerpt", "body", "status", "published_at"],
    portfolio: ["title", "category", "summary", "details", "url", "featured"],
    media: ["title", "description", "category", "is_featured", "is_published"]
  }[resource];
  if (!editable) return res.status(404).json({ error: "Unknown admin resource." });
  const payload = Object.fromEntries(editable.filter(key => req.body?.[key] !== undefined).map(key => [key, req.body[key]]));
  if (resource === "invoices" && payload.status === "paid") {
    return res.status(400).json({ error: "Invoices are marked paid only after server-side payment verification." });
  }
  if (!Object.keys(payload).length) return res.status(400).json({ error: "No editable fields supplied." });
  const { data, error } = await db.from(table).update(payload).eq("id", Number(req.params.id)).select("*").maybeSingle();
  if (error) return sendError(res, error, 400);
  if (!data) return res.status(404).json({ error: "Record not found." });
  await audit(req.user, "update", resource, req.params.id, { fields: Object.keys(payload) });
  res.json({ item: data });
});
app.post("/api/admin/media/upload", requireStaff, async (req, res) => {
  if (!staffCan(req, "media")) return res.status(403).json({ error: "Your staff role cannot upload media." });
  const title = clean(req.body?.title);
  const category = clean(req.body?.category) || "STC";
  const filename = clean(req.body?.filename);
  const contentType = clean(req.body?.content_type);
  const base64 = clean(req.body?.base64);
  if (!title || !filename || !base64 || !/^image\/(jpeg|png|webp|gif)$/.test(contentType)) {
    return res.status(400).json({ error: "Upload a JPG, PNG, WEBP or GIF image with a title." });
  }
  const bytes = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) return res.status(400).json({ error: "Image must be smaller than 8 MB." });
  const extension = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = "gallery/" + crypto.randomUUID() + "." + extension;
  const { error: uploadError } = await db.storage.from("stc-media").upload(key, bytes, { contentType, upsert: false });
  if (uploadError) return sendError(res, uploadError, 400);
  const { data, error } = await db.from("stc_media").insert({
    title, description: clean(req.body?.description), category, media_type: "image",
    storage_key: key, content_type: contentType,
    is_featured: Boolean(req.body?.is_featured), is_published: true
  }).select("*").single();
  if (error) return sendError(res, error, 500);
  await audit(req.user, "upload", "media", data.id, { filename });
  res.status(201).json({
    item: { ...data, url: db.storage.from("stc-media").getPublicUrl(key).data.publicUrl }
  });
});
app.get("/api/admin/tickets/:id/messages", requireStaff, async (req, res) => {
  if (!staffCan(req, "tickets")) return res.status(403).json({ error: "Your staff role cannot access support tickets." });
  const { data, error } = await db.from("stc_messages").select("*")
    .eq("ticket_id", Number(req.params.id)).order("created_at");
  if (error) return sendError(res, error, 500);
  res.json({ messages: data || [] });
});
app.post("/api/admin/tickets/:id/messages", requireStaff, async (req, res) => {
  if (!staffCan(req, "tickets")) return res.status(403).json({ error: "Your staff role cannot reply to support tickets." });
  const message = clean(req.body?.message);
  if (!message || message.length > 4000) return res.status(400).json({ error: "Enter a message." });
  const { data: ticket } = await db.from("stc_tickets").select("id,client_user_id")
    .eq("id", Number(req.params.id)).maybeSingle();
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });
  const { error } = await db.from("stc_messages").insert({
    ticket_id: ticket.id, sender_user_id: req.user.id, message
  });
  if (error) return sendError(res, error, 500);
  await db.from("stc_notifications").insert({
    user_id: ticket.client_user_id, title: "Support replied",
    body: "There is a new reply to your support ticket."
  });
  res.status(201).json({ message: "Reply sent." });
});

app.delete("/api/admin/posts/:id", requireStaff, async (req, res) => {
  if (!staffCan(req, "posts")) return res.status(403).json({ error: "Your staff role cannot remove announcements." });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid post ID." });
  const { data, error } = await db.from("stc_posts").delete().eq("id", id).select("id").maybeSingle();
  if (error) return sendError(res, error, 400);
  if (!data) return res.status(404).json({ error: "Post not found." });
  await audit(req.user, "delete", "posts", id, {});
  res.json({ message: "Announcement removed." });
});

/* STC student accounts, training enrolments and bank-transfer verification */
app.patch("/api/account/profile", requireUser, async (req, res) => {
  const account_type = ["student", "client"].includes(req.body?.account_type) ? req.body.account_type : null;
  const full_name = clean(req.body?.full_name);
  const phone = clean(req.body?.phone);
  const institution = clean(req.body?.institution);
  const department = clean(req.body?.department);
  const company = clean(req.body?.company);
  const study_level = clean(req.body?.study_level);
  if (!account_type || !full_name || full_name.length > 120 || phone.length > 40 ||
      institution.length > 180 || department.length > 160 || study_level.length > 80 || company.length > 160) {
    return res.status(400).json({ error: "Enter valid account and profile details." });
  }
  const payload = { user_id: req.user.id, account_type, full_name, phone, institution, department, study_level, company };
  const { data: existing } = await db.from("stc_profiles").select("student_number")
    .eq("user_id", req.user.id).maybeSingle();
  if (account_type === "student" && !existing?.student_number) {
    payload.student_number = "STC-STU-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  }
  const { error } = await db.from("stc_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) return sendError(res, error, 400);
  await audit(req.user, "update_account_profile", "profiles", req.user.id, { account_type });
  res.json({ message: "Account profile saved.", account_type, student_number: payload.student_number || existing?.student_number || null });
});

app.post("/api/student/enrollments", requireUser, async (req, res) => {
  const { data: profile } = await db.from("stc_profiles").select("account_type")
    .eq("user_id", req.user.id).maybeSingle();
  if (profile?.account_type !== "student") return res.status(403).json({ error: "A student account is required." });
  const course_name = clean(req.body?.course_name);
  const mode = ["Online", "Physical", "Hybrid"].includes(req.body?.mode) ? req.body.mode : "Online";
  const institution = clean(req.body?.institution);
  const department = clean(req.body?.department);
  const study_level = clean(req.body?.study_level);
  const placement_duration = clean(req.body?.placement_duration);
  const start_date = clean(req.body?.start_date);
  if (!course_name || course_name.length > 160 || institution.length > 180 ||
      department.length > 160 || study_level.length > 80 || placement_duration.length > 80) {
    return res.status(400).json({ error: "Check the programme and student details." });
  }
  const { data, error } = await db.from("stc_training_enrollments").insert({
    user_id: req.user.id, course_name, mode, institution, department, study_level,
    placement_duration, start_date: /^\\d{4}-\\d{2}-\\d{2}$/.test(start_date) ? start_date : null
  }).select("*").single();
  if (error) return sendError(res, error, 400);
  await audit(req.user, "submit_training_enrollment", "training_enrollments", data.id, { course_name });
  res.status(201).json({ enrollment: data, message: "Your training application has been submitted for review." });
});

app.get("/api/public/payment-settings", async (_req, res) => {
  const { data, error } = await db.from("stc_payment_settings")
    .select("bank_name,account_name,account_number,transfer_instructions").eq("id", 1).maybeSingle();
  if (error) return sendError(res, error, 500);
  res.json({ settings: data || null });
});

app.post("/api/client/invoices/:id/bank-transfer", requireUser, async (req, res) => {
  const invoiceId = Number(req.params.id);
  const transaction_reference = clean(req.body?.transaction_reference);
  const base64 = clean(req.body?.receipt_base64);
  const filename = clean(req.body?.filename);
  const contentType = clean(req.body?.content_type);
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1 || !transaction_reference ||
      transaction_reference.length > 120 || !base64 ||
      !["image/jpeg","image/png","image/webp","application/pdf"].includes(contentType)) {
    return res.status(400).json({ error: "Provide the transfer reference and a JPG, PNG, WEBP or PDF receipt." });
  }
  const { data: invoice } = await db.from("stc_invoices").select("*")
    .eq("id", invoiceId).eq("client_user_id", req.user.id).maybeSingle();
  if (!invoice) return res.status(404).json({ error: "Invoice not found." });
  if (invoice.status === "paid") return res.status(409).json({ error: "This invoice is already paid." });
  const bytes = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) return res.status(400).json({ error: "Receipt must be smaller than 5 MB." });
  const amount = Number(req.body?.amount);
  const { data: paidRows } = await db.from("stc_payments").select("amount").eq("invoice_id", invoice.id).eq("status", "success");
  const alreadyPaid = (paidRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const outstanding = Math.max(0, Number(invoice.amount) - alreadyPaid);
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number(invoice.amount) || amount > outstanding + 0.01) {
    return res.status(400).json({ error: "Enter a valid payment amount not exceeding the invoice balance." });
  }
  const key = "receipts/" + req.user.id + "/" + crypto.randomUUID() + (contentType === "application/pdf" ? ".pdf" : contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg");
  const { error: uploadError } = await db.storage.from("stc-payment-receipts").upload(key, bytes, { contentType, upsert: false });
  if (uploadError) return sendError(res, uploadError, 400);
  const reference = "STC-BT-" + crypto.randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase();
  const { data, error } = await db.from("stc_payments").insert({
    invoice_id: invoice.id, client_user_id: req.user.id, reference, amount,
    currency: invoice.currency || "NGN", method: "bank_transfer",
    status: "pending_verification", receipt_key: key,
    transaction_reference, receipt_submitted_at: new Date().toISOString(), notes: filename.slice(0,160)
  }).select("id,reference,amount,currency,status,created_at").single();
  if (error) {
    await db.storage.from("stc-payment-receipts").remove([key]);
    return sendError(res, error, 400);
  }
  await db.from("stc_notifications").insert({
    user_id: req.user.id, title: "Transfer receipt received",
    body: "Your transfer receipt " + reference + " is awaiting STC finance verification."
  });
  res.status(201).json({ payment: data, message: "Receipt submitted. Your payment will be confirmed after STC checks the bank account." });
});

app.get("/api/admin/payment-settings", requireStaff, async (req, res) => {
  if (!staffCan(req, "payments")) return res.status(403).json({ error: "Finance access is required." });
  const { data, error } = await db.from("stc_payment_settings").select("*").eq("id",1).maybeSingle();
  if (error) return sendError(res, error, 500);
  res.json({ settings: data || {} });
});
app.put("/api/admin/payment-settings", requireStaff, async (req, res) => {
  if (!staffCan(req, "payments")) return res.status(403).json({ error: "Finance access is required." });
  const bank_name = clean(req.body?.bank_name);
  const account_name = clean(req.body?.account_name);
  const account_number = clean(req.body?.account_number);
  const transfer_instructions = clean(req.body?.transfer_instructions);
  if (bank_name.length > 100 || account_name.length > 120 || (account_number && !/^\\d{10}$/.test(account_number)) || transfer_instructions.length > 800) {
    return res.status(400).json({ error: "Check the bank details. Nigerian account numbers must contain 10 digits." });
  }
  const { data, error } = await db.from("stc_payment_settings").upsert({
    id:1, bank_name:bank_name || null, account_name:account_name || null,
    account_number:account_number || null, transfer_instructions:transfer_instructions || null,
    updated_by:req.user.id, updated_at:new Date().toISOString()
  }, { onConflict:"id" }).select("*").single();
  if (error) return sendError(res, error, 400);
  await audit(req.user, "update_bank_transfer_settings", "payment_settings", 1, { bank_name, account_name, account_number: account_number ? "updated" : "empty" });
  res.json({ settings:data, message:"Bank transfer settings saved." });
});
app.get("/api/admin/payments/:id/receipt", requireStaff, async (req, res) => {
  if (!staffCan(req, "payments")) return res.status(403).json({ error: "Finance access is required." });
  const { data: payment } = await db.from("stc_payments").select("receipt_key")
    .eq("id", Number(req.params.id)).maybeSingle();
  if (!payment?.receipt_key) return res.status(404).json({ error: "Receipt not found." });
  const { data, error } = await db.storage.from("stc-payment-receipts").createSignedUrl(payment.receipt_key, 300);
  if (error) return sendError(res, error, 500);
  res.json({ url:data.signedUrl, expires_in:300 });
});
app.post("/api/admin/payments/:id/verify", requireStaff, async (req, res) => {
  if (!staffCan(req, "payments")) return res.status(403).json({ error: "Finance access is required." });
  const id = Number(req.params.id);
  const decision = clean(req.body?.decision);
  const rejection_reason = clean(req.body?.rejection_reason);
  if (!Number.isSafeInteger(id) || id < 1 || !["approve","reject"].includes(decision)) return res.status(400).json({ error: "Invalid verification action." });
  const { data: payment } = await db.from("stc_payments").select("*").eq("id",id).maybeSingle();
  if (!payment || payment.method !== "bank_transfer") return res.status(404).json({ error: "Bank transfer payment not found." });
  if (payment.status !== "pending_verification") return res.status(409).json({ error: "This payment has already been reviewed." });
  if (decision === "reject" && !rejection_reason) return res.status(400).json({ error: "Give a reason for rejecting this receipt." });
  const nextStatus = decision === "approve" ? "success" : "rejected";
  const { data, error } = await db.from("stc_payments").update({
    status:nextStatus, verified_by:req.user.id,
    verified_at:new Date().toISOString(),
    rejection_reason:decision === "reject" ? rejection_reason.slice(0,500) : null
  }).eq("id",id).eq("status","pending_verification").select("*").maybeSingle();
  if (error) return sendError(res,error,400);
  if (!data) return res.status(409).json({ error:"Payment was already reviewed." });
  if (decision === "approve" && payment.invoice_id) {
    const { data: successful } = await db.from("stc_payments").select("amount")
      .eq("invoice_id",payment.invoice_id).eq("status","success");
    const paid = (successful || []).reduce((sum,item)=>sum+Number(item.amount||0),0);
    const { data: invoice } = await db.from("stc_invoices").select("amount,client_user_id")
      .eq("id",payment.invoice_id).maybeSingle();
    if (invoice) await db.from("stc_invoices").update({
      status:paid + 0.005 >= Number(invoice.amount) ? "paid" : "partially_paid"
    }).eq("id",payment.invoice_id);
  }
  await db.from("stc_notifications").insert({
    user_id:payment.client_user_id,
    title:decision === "approve" ? "Bank transfer verified" : "Receipt needs attention",
    body:decision === "approve" ? "Your bank transfer " + payment.reference + " has been confirmed." : "Your receipt was not verified: " + rejection_reason
  });
  await audit(req.user, decision === "approve" ? "verify_bank_transfer" : "reject_bank_transfer", "payments", id, { reference:payment.reference });
  res.json({ payment:data, message:decision === "approve" ? "Payment verified." : "Receipt rejected." });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.listen(PORT, () => console.log("Stanley Tech Connect platform listening on " + PORT));
