import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { db } from "./database.js";
import { authDatabasePool } from "./auth.js";
import { auth } from "./auth.js";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });
const enquiryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });

const {
  STC_ADMIN_EMAIL,
  STC_PUBLIC_URL,
  PAYSTACK_SECRET_KEY
} = process.env;

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.paystack.co"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use("/api/better-auth", authLimiter);
app.all("/api/better-auth/*splat", toNodeHandler(auth));
app.use(express.json({ limit: "12mb", verify: (req, _res, buffer) => { if (req.originalUrl === "/api/paystack/webhook") req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));

app.use("/api", apiLimiter);
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

const clean = value => typeof value === "string" ? value.trim() : "";
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const adminEmail = clean(STC_ADMIN_EMAIL).toLowerCase();

const escapeEmailHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
async function sendStcEmail({ to, subject, text, replyTo }) {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: "email_not_configured" };
  const from = clean(process.env.STC_EMAIL_FROM) || "Stanley Tech Connect <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from, to: [to], subject, text,
      ...(replyTo ? { reply_to: replyTo } : {})
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Resend email failed (" + response.status + "): " + (result.message || result.name || "Unknown provider error"));
  return { sent: true, id: result.id || null };
}


async function verifiedUser(req) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.user) return session.user;
  } catch (error) {
    console.error("Better Auth session lookup failed:", error.message);
  }
  return null;
}

async function requireUser(req, res, next) {
  const user = await verifiedUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in to continue." });
  req.user = user;
  next();
}

async function resolveAccountRole(user) {
  const email = clean(user.email).toLowerCase();
  if (adminEmail && email === adminEmail) return "super_admin";
  const [{ data: staff }, { data: profile }] = await Promise.all([
    db.from("stc_staff_roles").select("role,is_active").eq("user_id", user.id).maybeSingle(),
    db.from("stc_profiles").select("account_type").eq("user_id", user.id).maybeSingle()
  ]);
  if (staff?.is_active) return staff.role;
  return profile?.account_type === "student" ? "student" : "client";
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

const permissionResources = ["profiles","students","clients","enrollments","certificates","awards","enquiries","projects","quotes","invoices","payments","tickets","services","posts","portfolio","media"];
const permissionCapabilities = {
  profiles:{read:true},students:{read:true},clients:{read:true},
  enrollments:{read:true,update:true,delete:true},
  certificates:{read:true,update:true,delete:true},awards:{read:true,update:true,delete:true},
  enquiries:{read:true,update:true},
  projects:{create:true,read:true,update:true,delete:true},
  quotes:{create:true,read:true,update:true,delete:true},
  invoices:{create:true,read:true,update:true,delete:true},
  payments:{read:true,update:true},
  tickets:{create:true,read:true,update:true,delete:true},
  services:{create:true,read:true,update:true,delete:true},
  posts:{create:true,read:true,update:true,delete:true},
  portfolio:{create:true,read:true,update:true,delete:true},
  media:{create:true,read:true,update:true,delete:true}
};
async function staffCan(req, resource, action = "read") {
  if (req.staffRole === "super_admin") return true;
  if (!["create", "read", "update", "delete"].includes(action)) return false;
  const { data, error } = await db.from("stc_role_permissions")
    .select("can_create,can_read,can_update,can_delete")
    .eq("role_key", req.staffRole).eq("resource_key", resource).maybeSingle();
  if (error) {
    console.error("Staff permission lookup failed:", error.message);
    return false;
  }
  return Boolean(data?.["can_" + action]);
}

function sendError(res, error, status = 400) {
  console.error("STC_API_ERROR", JSON.stringify({ status, type:typeof error, constructor:error?.constructor?.name || null, text:String(error), ownKeys:error ? Object.getOwnPropertyNames(Object(error)).reduce((out,key)=>{try{out[key]=String(error[key]).slice(0,1200)}catch{out[key]="[unreadable]"}return out;},{}):null }));
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
app.get("/api/public/graduates", async (_req, res) => {
  const { data, error } = await db.from("stc_media").select("id,title,description,storage_key,created_at").eq("category", "Graduating Students").eq("is_published", true).order("created_at", { ascending: false }).limit(60);
  if (error) return sendError(res, error, 500);
  res.json({ photos: (data || []).map(item => ({ ...item, url: db.storage.from("stc-media").getPublicUrl(item.storage_key).data.publicUrl })) });
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
  const notificationText = [
    "New STC website enquiry",
    "",
    "Reference: " + data.id,
    "Name: " + name,
    "Email: " + email,
    "Phone: " + (phone || "Not provided"),
    "Service: " + service,
    "Subject: " + (subject || service),
    "",
    "Message:",
    message
  ].join("\\n");
  try {
    await sendStcEmail({
      to: adminEmail || "stanleytechconnect@gmail.com",
      subject: "New STC enquiry: " + (subject || service),
      text: notificationText,
      replyTo: email
    });
  } catch (emailError) {
    console.error("STC enquiry notification email failed:", emailError.message);
  }
  // Applicant acknowledgements require a verified sending domain configured as STC_EMAIL_FROM.
  if (clean(process.env.STC_EMAIL_FROM) && !clean(process.env.STC_EMAIL_FROM).includes("@resend.dev")) {
    try {
      await sendStcEmail({
        to: email,
        subject: "We received your enquiry - Stanley Tech Connect",
        text: "Hello " + name + ",\\n\\nThank you for contacting Stanley Tech Connect. We have received your enquiry about " + service + " and our team will get back to you.\\n\\nYour reference: " + data.id + "\\n\\nStanley Tech Connect"
      });
    } catch (emailError) {
      console.error("STC applicant acknowledgement email failed:", emailError.message);
    }
  }
  res.status(201).json({
    message: "Your enquiry has reached Stanley Tech Connect. We'll be in touch.",
    reference: data.id
  });
});

app.get("/api/auth/me", requireUser, async (req, res) => {
  const { data: profile } = await db.from("stc_profiles")
    .select("full_name,phone,company,account_type,institution,department,study_level,student_number").eq("user_id", req.user.id).maybeSingle();
  const role = await resolveAccountRole(req.user);
  res.json({
    user: { id: req.user.id, email: req.user.email }, profile,
    role,
    is_admin: role === "super_admin"
  });
});

app.post("/api/account/profile", requireUser, async (req, res) => {
  const full_name = clean(req.body?.full_name);
  const account_type = ["student", "client"].includes(req.body?.account_type) ? req.body.account_type : null;
  const phone = clean(req.body?.phone);
  const institution = clean(req.body?.institution);
  const department = clean(req.body?.department);
  const study_level = clean(req.body?.study_level);
  const company = clean(req.body?.company);
  if (!full_name || full_name.length > 120 || !account_type || phone.length > 40 ||
      institution.length > 180 || department.length > 160 || study_level.length > 80 || company.length > 160) {
    return res.status(400).json({ error: "Check your account profile details." });
  }
  if (account_type === "student" && (!institution || !department || !study_level)) {
    return res.status(400).json({ error: "Students must provide their institution, department and study level." });
  }
  const profile = {
    user_id: req.user.id, full_name, account_type, phone: phone || null,
    institution: institution || null, department: department || null,
    study_level: study_level || null, company: company || null
  };
  if (account_type === "student") {
    profile.student_number = "STC-STU-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  }
  const { data, error } = await db.from("stc_profiles")
    .upsert(profile, { onConflict: "user_id" })
    .select("user_id,full_name,account_type,student_number").single();
  if (error) return sendError(res, error, 400);
  res.status(201).json({ profile: data, role: account_type });
});

// Student dashboard data is isolated to the authenticated student's own records.
app.get("/api/student/dashboard", requireUser, async (req, res) => {
  const uid = req.user.id;
  const { data: profile, error: profileError } = await db.from("stc_profiles")
    .select("full_name,phone,institution,department,study_level,student_number,avatar_key,account_type")
    .eq("user_id", uid).maybeSingle();
  if (profileError) return sendError(res, profileError, 500);
  if (profile?.account_type !== "student") return res.status(403).json({ error: "A student account is required." });
  const results = await Promise.all([
    db.from("stc_training_enrollments").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    db.from("stc_notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(30),
    db.from("stc_certificates").select("id,certificate_number,programme,issued_at,status").eq("user_id", uid).eq("status", "issued").order("issued_at", { ascending: false }),
    db.from("stc_awards").select("id,award_number,award_title,issued_at,status").eq("user_id", uid).eq("status", "issued").order("issued_at", { ascending: false })
  ]);
  const error = results.find(item => item.error)?.error;
  if (error) return sendError(res, error, 500);
  res.json({ profile: profile || {}, enrollments: results[0].data || [], notifications: results[1].data || [], certificates: results[2].data || [], awards: results[3].data || [] });
});

// Client portal
app.get("/api/client/dashboard", requireUser, async (req, res) => {
  const uid = req.user.id;
  const results = await Promise.all([
    db.from("stc_profiles").select("full_name,phone,company,account_type,institution,department,study_level,student_number,avatar_key").eq("user_id", uid).maybeSingle(),
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
  const [certificates, awards] = await Promise.all([
    db.from("stc_certificates").select("*").eq("user_id", uid).eq("status", "issued").order("issued_at", { ascending: false }),
    db.from("stc_awards").select("*").eq("user_id", uid).eq("status", "issued").order("issued_at", { ascending: false })
  ]);
  if (certificates.error || awards.error) return sendError(res, certificates.error || awards.error, 500);
  const avatarUrl = profile.data?.avatar_key ? (await db.storage.from("stc-private-files").createSignedUrl(profile.data.avatar_key, 600)).data?.signedUrl || null : null;
  const signedCertificates = await Promise.all((certificates.data || []).map(async item => ({ ...item, signature_key: undefined, signature_url: item.signature_key ? (await db.storage.from("stc-private-files").createSignedUrl(item.signature_key, 600)).data?.signedUrl || null : null })));
  const signedAwards = await Promise.all((awards.data || []).map(async item => ({ ...item, signature_url: item.signature_key ? (await db.storage.from("stc-private-files").createSignedUrl(item.signature_key, 600)).data?.signedUrl || null : null })));
  res.json({
    profile: profile.data || {}, projects: projects.data || [], quotes: quotes.data || [],
    invoices: invoices.data || [], payments: payments.data || [],
    tickets: tickets.data || [], notifications: notifications.data || [], enrollments: enrollments.data || [],
    certificates: signedCertificates, awards: signedAwards, avatar_url: avatarUrl
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
      callback_url: (STC_PUBLIC_URL || "https://stanley-tech-connect.onrender.com").replace(/\/$/, "") + "/?payment=verify",
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
  if (!["super_admin", "manager"].includes(req.staffRole)) return res.status(403).json({ error: "Your staff role does not have access to the management overview." });
  const labels = [
    "enquiry count","project count","invoice count","support ticket count","payment count","student count",
    "training enrolment count","issued certificate count","issued award count","profile count","client count",
    "active staff count","service count","published post count","portfolio count","media count",
    "recent enquiries","recent projects","recent support tickets","project status data","payment summary data",
    "enrolment status data","enquiry status data","recent audit activity","administrator notifications"
  ];
  const results = await Promise.all([
    db.from("stc_enquiries").select("id", { count:"exact", head:true }),
    db.from("stc_projects").select("id", { count:"exact", head:true }),
    db.from("stc_invoices").select("id", { count:"exact", head:true }),
    db.from("stc_tickets").select("id", { count:"exact", head:true }),
    db.from("stc_payments").select("id", { count:"exact", head:true }),
    db.from("stc_profiles").select("user_id", { count:"exact", head:true }).eq("account_type","student"),
    db.from("stc_training_enrollments").select("id", { count:"exact", head:true }),
    db.from("stc_certificates").select("id", { count:"exact", head:true }).eq("status","issued"),
    db.from("stc_awards").select("id", { count:"exact", head:true }).eq("status","issued"),
    db.from("stc_profiles").select("user_id", { count:"exact", head:true }),
    db.from("stc_profiles").select("user_id", { count:"exact", head:true }).eq("account_type","client"),
    db.from("stc_staff_roles").select("user_id", { count:"exact", head:true }).eq("is_active",true),
    db.from("stc_services").select("id", { count:"exact", head:true }),
    db.from("stc_posts").select("id", { count:"exact", head:true }),
    db.from("stc_portfolio").select("id", { count:"exact", head:true }),
    db.from("stc_media").select("id", { count:"exact", head:true }),
    db.from("stc_enquiries").select("*").order("created_at", { ascending:false }).limit(8),
    db.from("stc_projects").select("*").order("created_at", { ascending:false }).limit(8),
    db.from("stc_tickets").select("*").order("created_at", { ascending:false }).limit(8),
    db.from("stc_projects").select("status,created_at").order("created_at", { ascending:false }).limit(1000),
    db.from("stc_payments").select("amount,currency,status,created_at").order("created_at", { ascending:false }).limit(1000),
    db.from("stc_training_enrollments").select("status,created_at").order("created_at", { ascending:false }).limit(1000),
    db.from("stc_enquiries").select("status,created_at").order("created_at", { ascending:false }).limit(1000),
    db.from("stc_audit_logs").select("actor,action,entity,entity_id,created_at,details").order("created_at", { ascending:false }).limit(12),
    db.from("stc_notifications").select("*").eq("user_id",req.user.id).order("created_at", { ascending:false }).limit(8)
  ]);
  const failedIndex = results.findIndex(item => item.error);
  if (failedIndex !== -1) {
    console.error("STC_ADMIN_DASHBOARD_QUERY_FAILED", JSON.stringify({ query:labels[failedIndex], error:results[failedIndex].error }));
    return res.status(503).json({ error:"The dashboard could not load its "+labels[failedIndex]+". Your sign-in is still active; please try again shortly." });
  }
  const count = index => results[index].count || 0;
  const groupByStatus = rows => (rows || []).reduce((groups,row) => {
    const key = String(row.status || "unspecified").toLowerCase();
    groups[key] = (groups[key] || 0) + 1;
    return groups;
  }, {});
  const monthlyActivity = {};
  const monthCutoff = new Date();
  monthCutoff.setMonth(monthCutoff.getMonth() - 5);
  for (const rows of [results[19].data,results[20].data,results[21].data,results[22].data]) {
    for (const row of rows || []) {
      const date = new Date(row.created_at);
      if (!Number.isFinite(date.getTime()) || date < monthCutoff) continue;
      const month = date.toISOString().slice(0,7);
      monthlyActivity[month] = (monthlyActivity[month] || 0) + 1;
    }
  }
  const revenueByCurrency = {};
  for (const payment of results[20].data || []) {
    if (String(payment.status).toLowerCase() !== "success") continue;
    const currency = String(payment.currency || "Unspecified").toUpperCase();
    const amount = Number(payment.amount);
    if (Number.isFinite(amount)) revenueByCurrency[currency] = (revenueByCurrency[currency] || 0) + amount;
  }
  res.json({
    role:req.staffRole,
    metrics:{
      enquiries:count(0),projects:count(1),invoices:count(2),tickets:count(3),payments:count(4),
      students:count(5),training_applications:count(6),certificates_issued:count(7),awards_issued:count(8),
      profiles:count(9),clients:count(10),staff:count(11),services:count(12),posts:count(13),
      portfolio:count(14),media:count(15)
    },
    enquiries:results[16].data||[],projects:results[17].data||[],tickets:results[18].data||[],
    analytics:{
      project_status:groupByStatus(results[19].data),
      payment_status:groupByStatus(results[20].data),
      enrolment_status:groupByStatus(results[21].data),
      enquiry_status:groupByStatus(results[22].data),
      revenue_by_currency:revenueByCurrency,monthly_activity:monthlyActivity
    },
    activity:results[23].data||[],notifications:results[24].data||[]
  });
});


// Account security, private profile photos and credentials
app.post("/api/auth/password/reset", authLimiter, async (req, res) => {
  const email = clean(req.body?.email).toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: "Enter the email address on your STC account." });
  const redirectTo = (process.env.BETTER_AUTH_URL || "https://stc-staging.onrender.com").replace(/\/$/, "") + "/?password-reset=1";
  try {
    await auth.api.requestPasswordReset({ body: { email, redirectTo } });
    res.json({ message: "If an account exists for that email, a secure password-reset link has been sent." });
  } catch (error) {
    return sendError(res, error, 400);
  }
});
app.post("/api/auth/password/change", requireUser, authLimiter, async (req, res) => {
  const current_password = typeof req.body?.current_password === "string" ? req.body.current_password : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!current_password || password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: "Enter your current password and a new password of at least 10 characters." });
  }
  try {
    await auth.api.changePassword({
      body: { currentPassword: current_password, newPassword: password, revokeOtherSessions: true },
      headers: fromNodeHeaders(req.headers)
    });
  } catch (error) {
    return sendError(res, error, 400);
  }
  await audit(req.user, "change_password", "auth_user", req.user.id, {});
  res.json({ message: "Your password has been changed successfully." });
});
app.post("/api/auth/password/update", authLimiter, async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const token = clean(req.body?.token);
  if (password.length < 10 || password.length > 128 || !token) {
    return res.status(400).json({ error: "Use a password between 10 and 128 characters and provide the reset token." });
  }
  try {
    await auth.api.resetPassword({ body: { newPassword: password, token } });
    res.json({ message: "Your password has been updated. You can now sign in." });
  } catch (error) {
    return sendError(res, error, 400);
  }
});
app.post("/api/account/avatar", requireUser, async (req, res) => {
  const contentType = clean(req.body?.content_type);
  const base64 = clean(req.body?.base64);
  if (!["image/jpeg","image/png","image/webp"].includes(contentType) || !base64) return res.status(400).json({ error: "Choose a JPG, PNG or WEBP profile photo." });
  const bytes = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) return res.status(400).json({ error: "Profile photos must be smaller than 3 MB." });
  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  const key = "avatars/" + req.user.id + "/" + crypto.randomUUID() + "." + ext;
  const { error: uploadError } = await db.storage.from("stc-private-files").upload(key, bytes, { contentType, upsert: false });
  if (uploadError) return sendError(res, uploadError, 400);
  const { data: old } = await db.from("stc_profiles").select("avatar_key").eq("user_id", req.user.id).maybeSingle();
  const { error } = await db.from("stc_profiles").upsert({ user_id: req.user.id, avatar_key: key, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) { await db.storage.from("stc-private-files").remove([key]); return sendError(res, error, 400); }
  if (old?.avatar_key) await db.storage.from("stc-private-files").remove([old.avatar_key]);
  const signed = await db.storage.from("stc-private-files").createSignedUrl(key, 600);
  await audit(req.user, "update_profile_photo", "profiles", req.user.id, {});
  res.json({ message: "Profile photo updated.", avatar_url: signed.data?.signedUrl || null });
});
app.get("/api/account/avatar", requireUser, async (req, res) => {
  const { data, error } = await db.from("stc_profiles").select("avatar_key").eq("user_id", req.user.id).maybeSingle();
  if (error) return sendError(res, error, 500);
  if (!data?.avatar_key) return res.status(404).json({ error: "No profile photo has been uploaded." });
  const signed = await db.storage.from("stc-private-files").createSignedUrl(data.avatar_key, 600);
  if (signed.error) return sendError(res, signed.error, 500);
  res.json({ url: signed.data.signedUrl, expires_in: 600 });
});

// CEO electronic signature and issuance workflow
app.get("/api/admin/signature", requireStaff, async (req, res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can manage the official signature." });
  const { data, error } = await db.from("stc_brand_signatures").select("*").eq("id",1).maybeSingle();
  if (error) return sendError(res, error, 500);
  const signature_url = data?.signature_key ? (await db.storage.from("stc-private-files").createSignedUrl(data.signature_key,600)).data?.signedUrl || null : null;
  res.json({ signature: data || {}, signature_url });
});
app.put("/api/admin/signature", requireStaff, async (req, res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can sign official STC documents." });
  const signer_name = clean(req.body?.signer_name), signer_title = clean(req.body?.signer_title);
  if (!signer_name || signer_name.length > 120 || !signer_title || signer_title.length > 120) return res.status(400).json({ error: "Enter the signatory name and title." });
  const { data, error } = await db.from("stc_brand_signatures").upsert({ id:1, signer_name, signer_title, updated_by:req.user.id, updated_at:new Date().toISOString() }, { onConflict:"id" }).select("*").single();
  if (error) return sendError(res,error,400);
  await audit(req.user,"update_signatory","brand_signatures",1,{signer_name,signer_title});
  res.json({ signature:data, message:"Signatory details saved." });
});
app.post("/api/admin/signature/upload", requireStaff, async (req, res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can upload the official signature." });
  const base64=clean(req.body?.base64);
  if (!base64.startsWith("data:image/png;base64,")) return res.status(400).json({ error: "Upload a PNG signature image." });
  const bytes=Buffer.from(base64.replace(/^data:image\/png;base64,/,""),"base64");
  if (!bytes.length || bytes.length>1024*1024) return res.status(400).json({ error:"Signature image must be smaller than 1 MB." });
  const key="signatures/stc-ceo-"+crypto.randomUUID()+".png";
  const { error:uploadError }=await db.storage.from("stc-private-files").upload(key,bytes,{contentType:"image/png",upsert:false});
  if(uploadError)return sendError(res,uploadError,400);
  const { data:existing }=await db.from("stc_brand_signatures").select("signature_key").eq("id",1).maybeSingle();
  const { data, error }=await db.from("stc_brand_signatures").upsert({id:1,signer_name:clean(req.body?.signer_name),signer_title:clean(req.body?.signer_title),signature_key:key,updated_by:req.user.id,updated_at:new Date().toISOString()},{onConflict:"id"}).select("*").single();
  if(error){await db.storage.from("stc-private-files").remove([key]);return sendError(res,error,400);}
  if(existing?.signature_key) await db.storage.from("stc-private-files").remove([existing.signature_key]);
  await audit(req.user,"upload_electronic_signature","brand_signatures",1,{});
  res.json({message:"Electronic signature saved.",signature:data});
});
app.post("/api/admin/certificates", requireStaff, async (req,res) => {
  if(req.staffRole!=="super_admin") return res.status(403).json({error:"Only the CEO administrator can issue signed certificates."});
  const user_id=clean(req.body?.user_id), certificate_type=["course","service"].includes(req.body?.certificate_type)?req.body.certificate_type:"course";
  const certificate_title=clean(req.body?.certificate_title)|| (certificate_type==="service"?"Certificate of Service":"Certificate of Completion");
  const programme=clean(req.body?.programme), description=clean(req.body?.description), grade=clean(req.body?.grade);
  const enrollment_id=req.body?.enrollment_id?Number(req.body.enrollment_id):null;
  const project_id=req.body?.project_id?Number(req.body.project_id):null;
  if(!user_id||!programme||programme.length>180||certificate_title.length>160) return res.status(400).json({error:"Select the recipient and enter the course or service."});
  let recipient_name=clean(req.body?.recipient_name);
  if(!recipient_name){const {data:p}=await db.from("stc_profiles").select("full_name").eq("user_id",user_id).maybeSingle();recipient_name=p?.full_name||"";}
  if(!recipient_name)return res.status(400).json({error:"Recipient profile name is missing."});
  if(certificate_type==="course"){
    if(!enrollment_id)return res.status(400).json({error:"Select a completed course enrolment before issuing its certificate."});
    const {data:e}=await db.from("stc_training_enrollments").select("id,user_id,status,course_name").eq("id",enrollment_id).eq("user_id",user_id).maybeSingle();
    if(!e||e.status!=="completed")return res.status(409).json({error:"Course certificates can only be issued for completed enrolments."});
  }
  if(certificate_type==="service") { if(!project_id)return res.status(400).json({error:"Select a completed client project or service before issuing a service certificate."}); const {data:project}=await db.from("stc_projects").select("id").eq("id",project_id).eq("client_user_id",user_id).eq("status","completed").maybeSingle(); if(!project)return res.status(409).json({error:"Service certificates can only be issued for completed projects belonging to the selected user."}); }
  const {data:sig}=await db.from("stc_brand_signatures").select("signer_name,signer_title,signature_key").eq("id",1).maybeSingle();
  if(!sig?.signature_key||!sig.signer_name||!sig.signer_title)return res.status(409).json({error:"Save the CEO electronic signature and signatory details first."});
  const certificate_number="STC-CERT-"+new Date().getFullYear()+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
  const {data,error}=await db.from("stc_certificates").insert({user_id,enrollment_id,project_id:certificate_type==="service"?project_id:null,certificate_number,recipient_name,programme,certificate_title,description,grade,certificate_type,service_name:certificate_type==="service"?programme:null,signer_name:sig.signer_name,signer_title:sig.signer_title,signature_key:sig.signature_key,created_by:req.user.id,status:"issued"}).select("*").single();
  if(error)return sendError(res,error,400);
  await db.from("stc_notifications").insert({user_id,title:"A new STC certificate is ready",body:"Your "+programme+" certificate "+certificate_number+" is now available in your STC workspace."});
  await audit(req.user,"issue_certificate","certificates",data.id,{certificate_number,certificate_type});
  res.status(201).json({certificate:data,message:"Certificate issued successfully."});
});
app.post("/api/admin/awards", requireStaff, async (req,res) => {
  if(req.staffRole!=="super_admin")return res.status(403).json({error:"Only the CEO administrator can issue official awards."});
  const user_id=clean(req.body?.user_id), award_title=clean(req.body?.award_title), award_type=clean(req.body?.award_type)||"Achievement", description=clean(req.body?.description);
  if(!user_id||!award_title||award_title.length>180||award_type.length>100)return res.status(400).json({error:"Select a recipient and enter an award title."});
  const {data:p}=await db.from("stc_profiles").select("full_name").eq("user_id",user_id).maybeSingle();
  const {data:sig}=await db.from("stc_brand_signatures").select("signer_name,signer_title,signature_key").eq("id",1).maybeSingle();
  if(!p?.full_name)return res.status(400).json({error:"Recipient profile name is missing."});
  if(!sig?.signature_key)return res.status(409).json({error:"Save the CEO electronic signature first."});
  const award_number="STC-AWD-"+new Date().getFullYear()+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
  const {data,error}=await db.from("stc_awards").insert({user_id,recipient_name:p.full_name,award_title,award_type,description,award_number,signer_name:sig.signer_name,signer_title:sig.signer_title,signature_key:sig.signature_key,created_by:req.user.id,status:"issued"}).select("*").single();
  if(error)return sendError(res,error,400);
  await db.from("stc_notifications").insert({user_id,title:"You have received an STC award",body:"Congratulations! "+award_title+" has been added to your STC credentials."});
  await audit(req.user,"issue_award","awards",data.id,{award_number});
  res.status(201).json({award:data,message:"Award issued successfully."});
});
app.get("/api/public/awards/:number", async (req,res)=>{ const number=clean(req.params.number); const {data,error}=await db.from("stc_awards").select("award_number,award_title,award_type,recipient_name,issued_at,status,signer_name,signer_title").eq("award_number",number).maybeSingle(); if(error)return sendError(res,error,500); if(!data||data.status!=="issued")return res.status(404).json({error:"No active STC award matches that number."}); res.json({award:data,verified:true}); });
app.get("/api/public/certificates/:number", async (req,res)=>{
  const number=clean(req.params.number);
  const {data,error}=await db.from("stc_certificates").select("certificate_number,recipient_name,programme,certificate_title,certificate_type,issued_at,status,signer_name,signer_title").eq("certificate_number",number).maybeSingle();
  if(error)return sendError(res,error,500);
  if(!data||data.status!=="issued")return res.status(404).json({error:"No active STC certificate matches that number."});
  res.json({certificate:data,verified:true});
});

const adminTables = {
  enrollments: "stc_training_enrollments", enquiries: "stc_enquiries", projects: "stc_projects", quotes: "stc_quotes",
  invoices: "stc_invoices", payments: "stc_payments", tickets: "stc_tickets",
  services: "stc_services", posts: "stc_posts", portfolio: "stc_portfolio",
  media: "stc_media", profiles: "stc_profiles", staff: "stc_staff_roles",
  certificates: "stc_certificates", awards: "stc_awards"
};
app.get("/api/admin/students", requireStaff, async (req,res) => {
  if (!(await staffCan(req,"students","read"))) return res.status(403).json({error:"Your staff role cannot access student records."});
  const {data:profiles,error}=await db.from("stc_profiles").select("user_id,full_name,account_type,institution,department,study_level,student_number").order("full_name").limit(300);
  if(error)return sendError(res,error,500);
  const ids=(profiles||[]).map(p=>p.user_id);
  const {data:enrollments,enrollError}=ids.length?await db.from("stc_training_enrollments").select("id,user_id,course_name,status,created_at").in("user_id",ids).order("created_at",{ascending:false}):{data:[],error:null};
  if(enrollError)return sendError(res,enrollError,500);
  const {data:projects,error:projectError}=ids.length?await db.from("stc_projects").select("id,client_user_id,title,service,status").in("client_user_id",ids).eq("status","completed"):{data:[],error:null};
  if(projectError)return sendError(res,projectError,500);
  res.json({items:(profiles||[]).map(p=>({...p,training_count:(enrollments||[]).filter(e=>e.user_id===p.user_id).length,completed_projects_count:(projects||[]).filter(x=>x.client_user_id===p.user_id).length}))});
});
app.get("/api/admin/clients", requireStaff, async (req,res) => {
  if (!(await staffCan(req,"clients","read"))) return res.status(403).json({error:"Your staff role cannot access client records."});
  const {data:profiles,error}=await db.from("stc_profiles").select("user_id,full_name,account_type,company,phone").eq("account_type","client").order("full_name").limit(300);
  if(error)return sendError(res,error,500);
  const ids=(profiles||[]).map(p=>p.user_id);
  const [projects,invoices]=await Promise.all([
    ids.length?db.from("stc_projects").select("id,client_user_id").in("client_user_id",ids):Promise.resolve({data:[],error:null}),
    ids.length?db.from("stc_invoices").select("id,client_user_id,status,amount,currency").in("client_user_id",ids):Promise.resolve({data:[],error:null})
  ]);
  if(projects.error)return sendError(res,projects.error,500);
  if(invoices.error)return sendError(res,invoices.error,500);
  res.json({items:(profiles||[]).map(p=>({...p,project_count:(projects.data||[]).filter(x=>x.client_user_id===p.user_id).length,invoice_count:(invoices.data||[]).filter(x=>x.client_user_id===p.user_id).length}))});
});
app.get("/api/admin/staff", requireStaff, async (req,res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({error:"Only the CEO administrator can view the staff directory."});
  const {data:roles,error}=await db.from("stc_staff_roles").select("user_id,role,is_active").order("role");
  if(error)return sendError(res,error,500);
  const ids=(roles||[]).map(item=>item.user_id);
  const {data:profiles, error:profileError}=ids.length
    ? await db.from("stc_profiles").select("user_id,full_name,phone,department,account_type").in("user_id",ids)
    : {data:[],error:null};
  if(profileError)return sendError(res,profileError,500);
  const byUser=new Map((profiles||[]).map(profile=>[profile.user_id,profile]));
  const items=(roles||[]).map(item=>{
    const profile=byUser.get(item.user_id)||{};
    return {
      full_name:profile.full_name||"Profile not completed",
      phone:profile.phone||"",
      department:profile.department||"",
      role:item.role,
      is_active:item.is_active,
      user_id:item.user_id,
      account_type:profile.account_type||""
    };
  });
  res.json({items});
});
app.get("/api/admin/staff/accounts", requireStaff, async (req, res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can search accounts." });
  const term = clean(req.query?.q);
  if (term.length < 2) return res.json({ accounts: [] });
  if (term.length > 120) return res.status(400).json({ error: "Search text is too long." });
  try {
    const pattern = "%" + term + "%";
    const result = await authDatabasePool.query(
      'SELECT u.id, u.email, u.name, p.full_name, p.account_type, p.department FROM auth."user" u LEFT JOIN public.stc_profiles p ON p.user_id = u.id WHERE u.email ILIKE $1 OR u.name ILIKE $1 OR p.full_name ILIKE $1 ORDER BY COALESCE(NULLIF(p.full_name, \'\'), u.name), u.email LIMIT 12',
      [pattern]
    );
    res.json({ accounts: result.rows.map(row => ({
      user_id: row.id,
      name: row.full_name || row.name || "Name not provided",
      email: row.email,
      account_type: row.account_type || "profile incomplete",
      department: row.department || ""
    })) });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get("/api/staff/my-permissions", requireStaff, async (req,res) => {
  if(req.staffRole==="super_admin") return res.json({resources:permissionResources,permissions:Object.fromEntries(permissionResources.map(key=>[key,{read:true,create:true,update:true,delete:true}]))});
  const [{data,error},{data:roleDef}]=await Promise.all([db.from("stc_role_permissions").select("resource_key,can_create,can_read,can_update,can_delete").eq("role_key",req.staffRole),db.from("stc_staff_role_definitions").select("label").eq("role_key",req.staffRole).maybeSingle()]);
  if(error)return sendError(res,error,500);
  const permissions=Object.fromEntries((data||[]).map(row=>[row.resource_key,{read:row.can_read,create:row.can_create,update:row.can_update,delete:row.can_delete}]));
  res.json({role_label:roleDef?.label||req.staffRole,resources:permissionResources.filter(key=>permissions[key]?.read),permissions});
});
app.get("/api/admin/staff/permissions", requireStaff, async (req, res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can manage staff permissions." });
  const [rolesResult, permissionsResult] = await Promise.all([
    db.from("stc_staff_role_definitions").select("role_key,label,description,is_system,created_at,updated_at").order("label"),
    db.from("stc_role_permissions").select("role_key,resource_key,can_create,can_read,can_update,can_delete").order("resource_key")
  ]);
  if (rolesResult.error) return sendError(res, rolesResult.error, 500);
  if (permissionsResult.error) return sendError(res, permissionsResult.error, 500);
  res.json({ roles: rolesResult.data || [], resources: permissionResources, capabilities: permissionCapabilities, permissions: permissionsResult.data || [] });
});
app.post("/api/admin/staff/roles", requireStaff, async (req,res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({error:"Only Super Admin can create staff roles."});
  const role_key=clean(req.body?.role_key).toLowerCase().replace(/[^a-z0-9_]/g,"_");
  const label=clean(req.body?.label), description=clean(req.body?.description);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(role_key) || !label || label.length>80) return res.status(400).json({error:"Enter a valid role key and display name."});
  const {data,error}=await db.from("stc_staff_role_definitions").insert({role_key,label,description,is_system:false}).select().single();
  if(error)return sendError(res,error,400);
  const rows=permissionResources.map(resource_key=>({role_key,resource_key,can_create:false,can_read:false,can_update:false,can_delete:false}));
  const seeded=await db.from("stc_role_permissions").insert(rows);
  if(seeded.error){await db.from("stc_staff_role_definitions").delete().eq("role_key",role_key);return sendError(res,seeded.error,500);}
  await audit(req.user,"create_staff_role","staff",role_key,{label});
  res.status(201).json({item:data});
});
app.patch("/api/admin/staff/roles/:roleKey", requireStaff, async (req,res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({error:"Only Super Admin can edit staff roles."});
  const roleKey=clean(req.params.roleKey), payload={};
  if(typeof req.body?.label==="string" && clean(req.body.label)) payload.label=clean(req.body.label).slice(0,80);
  if(typeof req.body?.description==="string") payload.description=clean(req.body.description).slice(0,500);
  if(!Object.keys(payload).length)return res.status(400).json({error:"Supply a role name or description."});
  payload.updated_at=new Date().toISOString();
  const {data,error}=await db.from("stc_staff_role_definitions").update(payload).eq("role_key",roleKey).select().maybeSingle();
  if(error)return sendError(res,error,400);
  if(!data)return res.status(404).json({error:"Staff role not found."});
  await audit(req.user,"update_staff_role_definition","staff",roleKey,payload);
  res.json({item:data});
});
app.delete("/api/admin/staff/roles/:roleKey", requireStaff, async (req,res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({error:"Only Super Admin can delete staff roles."});
  const roleKey=clean(req.params.roleKey);
  const {data:role,error:roleError}=await db.from("stc_staff_role_definitions").select("role_key,is_system").eq("role_key",roleKey).maybeSingle();
  if(roleError)return sendError(res,roleError,500);
  if(!role)return res.status(404).json({error:"Staff role not found."});
  if(role.is_system)return res.status(409).json({error:"Built-in roles cannot be deleted. You can rename them and change their permissions."});
  const assigned=await db.from("stc_staff_roles").select("user_id",{count:"exact",head:true}).eq("role",roleKey);
  if(assigned.error)return sendError(res,assigned.error,500);
  if(assigned.count)return res.status(409).json({error:"This role is assigned to "+assigned.count+" staff member(s). Reassign them before deleting it."});
  const {error}=await db.from("stc_staff_role_definitions").delete().eq("role_key",roleKey);
  if(error)return sendError(res,error,400);
  await audit(req.user,"delete_staff_role","staff",roleKey,{});
  res.json({message:"Role deleted."});
});
app.put("/api/admin/staff/permissions", requireStaff, async (req,res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({error:"Only Super Admin can change staff permissions."});
  const roleKey=clean(req.body?.role_key);
  const changes=Array.isArray(req.body?.permissions)?req.body.permissions:[];
  if(!roleKey||!changes.length||changes.length>permissionResources.length)return res.status(400).json({error:"Select a role and provide its permission settings."});
  const roleCheck=await db.from("stc_staff_role_definitions").select("role_key").eq("role_key",roleKey).maybeSingle();
  if(roleCheck.error)return sendError(res,roleCheck.error,500);
  if(!roleCheck.data)return res.status(404).json({error:"Staff role not found."});
  const allowed=new Set(permissionResources);
  const rows=[];
  for(const item of changes){
    if(!allowed.has(item.resource_key))return res.status(400).json({error:"Unknown management area."});
    const supported=permissionCapabilities[item.resource_key]||{};
    for(const action of ["create","read","update","delete"]) if(item["can_"+action] && !supported[action]) return res.status(400).json({error:"The "+action.toUpperCase()+" action is not currently supported for "+item.resource_key+"."});
    rows.push({role_key:roleKey,resource_key:item.resource_key,can_create:Boolean(item.can_create),can_read:Boolean(item.can_read),can_update:Boolean(item.can_update),can_delete:Boolean(item.can_delete),updated_at:new Date().toISOString()});
  }
  const {error}=await db.from("stc_role_permissions").upsert(rows,{onConflict:"role_key,resource_key"});
  if(error)return sendError(res,error,400);
  await audit(req.user,"update_staff_permissions","staff",roleKey,{resources:rows.length});
  res.json({message:"Permissions saved.",updated:rows.length});
});
app.get("/api/admin/staff/activity", requireStaff, async (req, res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can view staff activity." });
  const { data, error } = await db.from("stc_audit_logs")
    .select("actor,action,entity,entity_id,created_at,details")
    .eq("entity", "staff").order("created_at", { ascending: false }).limit(30);
  if (error) return sendError(res, error, 500);
  res.json({ items: data || [] });
});

app.get("/api/admin/:resource", requireStaff, async (req, res) => {
  const table = adminTables[req.params.resource];
  if (!table) return res.status(404).json({ error: "Unknown admin resource." });
  if (!(await staffCan(req, req.params.resource, "read"))) return res.status(403).json({ error: "Your staff role cannot access this section." });
  const { data, error } = await db.from(table).select("*").limit(100);
  if (error) return sendError(res, error, 500);
  res.json({ items: data || [] });
});
app.post("/api/admin/:resource", requireStaff, async (req, res) => {
  const resource = req.params.resource;
  const table = adminTables[resource];
  if (!table || ["enquiries", "payments", "profiles", "media", "certificates", "awards"].includes(resource)) {
    return res.status(403).json({ error: "This resource cannot be created here." });
  }
  if (resource === "staff") {
    if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can manage staff roles." });
    const user_id = clean(req.body?.user_id);
    const role = clean(req.body?.role);
    const roleCheck=await db.from("stc_staff_role_definitions").select("role_key").eq("role_key",role).maybeSingle();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user_id) || !roleCheck.data) return res.status(400).json({ error: "Select an existing STC account and choose a valid staff role." });
    if (user_id === req.user.id) return res.status(409).json({ error: "Your own administrator account cannot be assigned through this form." });
    const accountCheck = await authDatabasePool.query('SELECT id FROM auth."user" WHERE id = $1 LIMIT 1', [user_id]);
    if (!accountCheck.rowCount) return res.status(404).json({ error: "That STC account could not be found. Search and select an account from the results." });
    const { data, error } = await db.from("stc_staff_roles").upsert({ user_id, role, is_active: true }, { onConflict: "user_id" }).select("*").single();
    if (error) return sendError(res, error, 400);
    await audit(req.user, "assign_staff_role", "staff", user_id, { role });
    return res.status(201).json({ item: data });
  }
  if (!(await staffCan(req, resource, "create"))) return res.status(403).json({ error: "Your staff role cannot create records in this section." });
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
    if (req.params.id === req.user.id) return res.status(409).json({ error: "You cannot change or suspend your own administrator access." });
    const payload = {};
    if (typeof req.body?.role === "string") { const roleCheck=await db.from("stc_staff_role_definitions").select("role_key").eq("role_key",req.body.role).maybeSingle(); if(roleCheck.data) payload.role=req.body.role; }
    if (typeof req.body?.is_active === "boolean") payload.is_active = req.body.is_active;
    if (!Object.keys(payload).length) return res.status(400).json({ error: "No valid staff fields supplied." });
    const { data, error } = await db.from("stc_staff_roles").update(payload).eq("user_id", req.params.id).select("*").maybeSingle();
    if (error) return sendError(res, error, 400);
    if (!data) return res.status(404).json({ error: "Staff record not found." });
    await audit(req.user, "update_staff_role", "staff", req.params.id, payload);
    return res.json({ item: data });
  }
  if (!(await staffCan(req, resource, "update"))) return res.status(403).json({ error: "Your staff role cannot edit this section." });
  const editable = {
    certificates: ["status"], awards: ["status"], enrollments: ["status", "supervisor", "study_level", "placement_duration"], enquiries: ["status"], projects: ["title", "description", "service", "status", "progress", "start_date", "due_date"],
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
  if (["certificates","awards"].includes(resource) && !["draft","issued","revoked"].includes(payload.status)) return res.status(400).json({error:"Credential status must be draft, issued or revoked."});
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
app.delete("/api/admin/:resource/:id", requireStaff, async (req,res,next) => {
  const resource=req.params.resource, table=adminTables[resource];
  if(resource==="staff") return next();
  const deletable=new Set(["projects","quotes","invoices","tickets","services","posts","portfolio","enrollments","certificates","awards","media"]);
  if(!table || !deletable.has(resource))return res.status(403).json({error:"Records in this section cannot be deleted from the dashboard."});
  if(!(await staffCan(req,resource,"delete")))return res.status(403).json({error:"Your role does not have delete permission for this section."});
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid record ID."});
  const {data,error}=await db.from(table).delete().eq("id",id).select("id").maybeSingle();
  if(error)return sendError(res,error,400);
  if(!data)return res.status(404).json({error:"Record not found."});
  await audit(req.user,"delete",resource,id,{});
  res.json({message:"Record deleted."});
});
app.delete("/api/admin/staff/:id", requireStaff, async (req, res) => {
  if (req.staffRole !== "super_admin") return res.status(403).json({ error: "Only the CEO administrator can remove staff access." });
  const userId = clean(req.params.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return res.status(400).json({ error: "Invalid staff account." });
  if (userId === req.user.id) return res.status(409).json({ error: "You cannot remove your own administrator access." });
  const { data, error } = await db.from("stc_staff_roles").delete().eq("user_id", userId).select("user_id,role").maybeSingle();
  if (error) return sendError(res, error, 400);
  if (!data) return res.status(404).json({ error: "Staff record not found." });
  await audit(req.user, "remove_staff_access", "staff", userId, { previous_role: data.role });
  return res.json({ message: "Staff access removed. The STC account itself was not deleted." });
});

app.post("/api/admin/media/upload", requireStaff, async (req, res) => {
  if (!(await staffCan(req, "media", "create"))) return res.status(403).json({ error: "Your staff role cannot upload media." });
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
  if (!(await staffCan(req, "tickets", "read"))) return res.status(403).json({ error: "Your staff role cannot access support tickets." });
  const { data, error } = await db.from("stc_messages").select("*")
    .eq("ticket_id", Number(req.params.id)).order("created_at");
  if (error) return sendError(res, error, 500);
  res.json({ messages: data || [] });
});
app.post("/api/admin/tickets/:id/messages", requireStaff, async (req, res) => {
  if (!(await staffCan(req, "tickets", "update"))) return res.status(403).json({ error: "Your staff role cannot reply to support tickets." });
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
  if (!(await staffCan(req, "posts", "delete"))) return res.status(403).json({ error: "Your staff role cannot remove announcements." });
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
  try {
    await sendStcEmail({
      to: adminEmail || "stanleytechconnect@gmail.com",
      subject: "New STC training application: " + course_name,
      text: [
        "New STC training / SIWES application",
        "",
        "Applicant: " + clean(req.user.name || req.user.email),
        "Email: " + clean(req.user.email),
        "Programme: " + course_name,
        "Mode: " + mode,
        "Institution: " + (institution || "Not provided"),
        "Department: " + (department || "Not provided"),
        "Study level: " + (study_level || "Not provided"),
        "Placement duration: " + (placement_duration || "Not provided"),
        "Start date: " + (start_date || "Not provided"),
        "Application ID: " + data.id
      ].join("\\n"),
      replyTo: clean(req.user.email)
    });
  } catch (emailError) {
    console.error("STC training application email failed:", emailError.message);
  }
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
  if (!(await staffCan(req, "payments", "read"))) return res.status(403).json({ error: "Finance access is required." });
  const { data, error } = await db.from("stc_payment_settings").select("*").eq("id",1).maybeSingle();
  if (error) return sendError(res, error, 500);
  res.json({ settings: data || {} });
});
app.put("/api/admin/payment-settings", requireStaff, async (req, res) => {
  if (!(await staffCan(req, "payments", "update"))) return res.status(403).json({ error: "Finance update permission is required." });
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
  if (!(await staffCan(req, "payments", "read"))) return res.status(403).json({ error: "Finance access is required." });
  const { data: payment } = await db.from("stc_payments").select("receipt_key")
    .eq("id", Number(req.params.id)).maybeSingle();
  if (!payment?.receipt_key) return res.status(404).json({ error: "Receipt not found." });
  const { data, error } = await db.storage.from("stc-payment-receipts").createSignedUrl(payment.receipt_key, 300);
  if (error) return sendError(res, error, 500);
  res.json({ url:data.signedUrl, expires_in:300 });
});
app.post("/api/admin/payments/:id/verify", requireStaff, async (req, res) => {
  if (!(await staffCan(req, "payments", "update"))) return res.status(403).json({ error: "Finance update permission is required." });
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
