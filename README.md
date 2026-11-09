# Stanley Tech Connect (STC)

Starter website for Stanley Tech Connect, built for deployment on Render.

## Stack
- Node.js 20+
- Express
- Supabase (server-side enquiry storage)
- HTML, CSS and vanilla JavaScript

## Run locally
1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add your Supabase project URL and **server-side** service-role key.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Render
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Render Environment settings.
- Do not commit `.env` or expose the service-role key in browser JavaScript.

## Important
This is the first deployable website foundation, not the complete STC client/admin platform. Authentication, OTP, staff roles, invoices, Paystack verification, ticketing and admin workflows must be implemented and security-tested before production use.
