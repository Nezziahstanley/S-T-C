# Stanley Tech Connect (STC) — Platform v2

Full-stack STC public website, passwordless client portal and staff/CEO workspace.

## Stack
- Node.js 20+
- Express 5
- Supabase Auth + Postgres + Storage
- Vanilla HTML/CSS/JavaScript
- Paystack server-side transaction initialization and verification

## Render settings
- Runtime: Node
- Build: `npm install`
- Start: `npm start`
- Root directory: blank
- Branch: `main`

## Required Render environment variables
- `SUPABASE_URL` — STC Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase secret key; never expose it in browser code
- `SUPABASE_PUBLISHABLE_KEY` — Supabase publishable key used for email OTP sign-in
- `STC_ADMIN_EMAIL` — CEO/admin login email; set to the authorised STC owner email
- `STC_PUBLIC_URL` — public Render URL, e.g. `https://stanley-tech-connect.onrender.com`
- `PAYSTACK_SECRET_KEY` — Paystack secret key; required before online invoice payments can be enabled
- `PORT` — provided by Render automatically

## Authentication
Clients sign in with a six-digit email OTP through Supabase Auth. The server validates every bearer token with Supabase Auth. Staff membership is read from `stc_staff_roles`. The super-admin account is matched server-side against `STC_ADMIN_EMAIL`; browser-provided role values are never trusted.

In Supabase Authentication settings:
1. Enable Email provider.
2. Confirm email OTP is enabled.
3. Ensure the email template includes `{{ .Token }}` so the user receives a six-digit code.
4. Set the Site URL to the Render URL.

## Database
This app uses the existing `stc_*` schema in the STC Supabase project. It does not drop or recreate existing tables. The service-role key is used only in the server process, and authenticated user IDs are checked on all client data requests.

## Payments
Paystack initialization and verification are implemented on the server. Payment status is updated only after Paystack returns a successful transaction with the exact expected amount, currency and reference. Add `PAYSTACK_SECRET_KEY` in Render before enabling payment collection. Do not mark a payment as paid based only on a browser redirect.

## Important production checks
- Configure a verified SMTP sender in Supabase for reliable OTP delivery.
- Set the real STC administrator email in Render.
- Add the Paystack live/test secret key only after the merchant account is ready.
- Test OTP, ownership isolation, enquiry creation, ticket replies and Paystack test transactions before accepting live payments.
