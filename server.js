
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));

app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.static(PUBLIC_DIR));

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Stanley Tech Connect" });
});

app.post("/api/enquiries", enquiryLimiter, async (req, res) => {
  const { name, email, service, message } = req.body || {};

  if (![name, email, service, message].every(
    value => typeof value === "string" && value.trim()
  )) {
    return res.status(400).json({ error: "Please complete all fields." });
  }

  if (
    name.length > 120 ||
    email.length > 254 ||
    service.length > 120 ||
    message.length > 4000
  ) {
    return res.status(400).json({ error: "One or more fields are too long." });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      error: "The enquiry service is being configured. Please email stanleytechconnect@gmail.com."
    });
  }

  try {
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { error } = await supabase
      .from("stc_enquiries")
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        service: service.trim(),
        message: message.trim()
      });

    if (error) throw error;

    return res.status(201).json({
      message: "Thanks! Your enquiry has been received."
    });
  } catch (error) {
    console.error("Enquiry insert failed:", error.message);

    return res.status(500).json({
      error: "We could not submit your enquiry. Please email stanleytechconnect@gmail.com."
    });
  }
});

// Express 5-compatible fallback for website pages
app.use((req, res, next) => {
  if (req.method !== "GET") return next();

  res.sendFile(path.join(PUBLIC_DIR, "index.html"), error => {
    if (error) next(error);
  });
});

app.listen(PORT, () => {
  console.log(`STC running on port ${PORT}`);
});
