import { randomBytes } from "node:crypto";
import { auth, authDatabasePool } from "../auth.js";

const email = (process.env.STC_ADMIN_EMAIL || "").trim().toLowerCase();
const expectedId = (process.env.STC_BOOTSTRAP_ADMIN_ID || "").trim();
const baseURL = process.env.BETTER_AUTH_URL;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("STC_ADMIN_EMAIL is missing or invalid.");
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedId)) {
  throw new Error("STC_BOOTSTRAP_ADMIN_ID must be a valid UUID.");
}
if (!baseURL) throw new Error("BETTER_AUTH_URL is missing.");

try {
  const existing = await authDatabasePool.query(
    'SELECT id::text AS id FROM auth."user" WHERE lower(email) = lower($1) LIMIT 1',
    [email]
  );

  if (existing.rows.length) {
    if (existing.rows[0].id !== expectedId) {
      throw new Error("An account with the administrator email already exists with a different ID. Stopping without changing it.");
    }
    console.log("Administrator account already exists with the expected legacy ID. No account was changed.");
  } else {
    const result = await auth.api.signUpEmail({
      body: {
        name: "stanleytechconnect",
        email,
        password: randomBytes(48).toString("base64url"),
        callbackURL: baseURL + "/"
      }
    });

    if (result?.user?.id !== expectedId) {
      throw new Error("Better Auth did not create the administrator with the expected legacy ID. Stopping for review.");
    }

    await authDatabasePool.query(
      'UPDATE auth."user" SET "emailVerified" = TRUE, "updatedAt" = NOW() WHERE id = $1',
      [expectedId]
    );
    await authDatabasePool.query(
      'DELETE FROM auth."session" WHERE "userId" = $1',
      [expectedId]
    );
    console.log("Administrator account created in Neon staging with the existing profile ID. A password reset is required before sign-in.");
  }
} finally {
  await authDatabasePool.end();
}
