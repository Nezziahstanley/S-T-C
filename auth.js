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
  secret,
  trustedOrigins: [baseURL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128
  },
  advanced: {
    database: {
      generateId: "uuid"
    }
  }
});

export { pool as authDatabasePool };
