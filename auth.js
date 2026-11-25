import { betterAuth } from "better-auth";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!databaseUrl) throw new Error("Missing DATABASE_URL for Better Auth.");
if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
if (!baseURL) throw new Error("Missing BETTER_AUTH_URL.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

export const auth = betterAuth({
  appName: "Stanley Tech Connect",
  database: {
    dialect: new PostgresDialect({ pool }),
    type: "postgres",
    schemaName: "auth"
  },
  baseURL,
  basePath: "/api/better-auth",
  secret,
  trustedOrigins: [baseURL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.STC_EMAIL_FROM;
      if (!apiKey || !from || !from.includes("@")) {
        throw new Error("Password reset email is not ready. Configure RESEND_API_KEY and a verified STC_EMAIL_FROM address.");
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: "Reset your Stanley Tech Connect password",
          text: "Hello " + (user.name || user.email) + ",\\n\\nUse the following secure link to reset your password. This link is time-limited and can only be used once:\\n\\n" + url + "\\n\\nIf you did not request this, you can ignore this email.\\n\\nStanley Tech Connect"
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("Better Auth reset email failed:", response.status, result.message || result.name || "Unknown Resend error");
        throw new Error("Unable to send the password reset email.");
      }
    }
  },
  advanced: {
    database: {
      generateId: "uuid"
    }
  }
});

export { pool as authDatabasePool };
