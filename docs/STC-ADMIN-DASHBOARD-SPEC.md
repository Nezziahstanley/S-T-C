# Stanley Tech Connect (STC) — Official Admin Dashboard Specification

Status: Approved product specification for the STC staging implementation  
Repository: `Nezziahstanley/S-T-C`  
Implementation branch: `staging`  
Production: Out of scope until explicit cutover approval

## 1. Product objective

The STC Admin Dashboard is the authenticated control centre for managing platform users, students, clients, staff, services, projects, training, finance, certificates, enquiries, communication, website content, reporting, and system administration.

The dashboard must be built against verified application requirements and real database records. It must never display fabricated metrics, fake activity, or controls that imply an action succeeded when it did not.

## 2. Global application layout

- Responsive application shell with a collapsible left navigation sidebar.
- Top bar containing STC branding, page title/breadcrumbs, global search (only when backed by implemented search), notifications, help, administrator profile, and sign-out.
- Main content area with page heading, description, contextual actions, filters, data visualizations, and data tables.
- Consistent page states: loading, empty, error, success, and permission denied.
- Mobile navigation uses a drawer or collapsible sidebar.
- Accessible labels, keyboard navigation, focus states, and semantic headings.

## 3. Navigation information architecture

### Dashboard
- Overview
- Analytics
- Recent activity
- System notifications

### User and access management
- All user profiles
- Administrators and staff roles
- Role assignments
- Account status and access history
- Permissions

### Student management
- Student profiles
- Training enrolments/applications
- Progress and status
- Certificates and awards

### Client management
- Client profiles
- Client enquiries
- Quotes, invoices, payments
- Projects and support tickets

### Staff management
- Staff role assignments
- Role status
- Staff responsibilities

### Services management
- Services
- Service enquiries
- Pricing and availability (only when the corresponding fields and workflows exist)

### Project management
- Projects
- Assignment and status
- Progress and deadlines

### Training and courses
- Training enrolments
- Course/programme information available on enrolment records
- Course materials, schedules, assessments, and completion only after their data model and workflows are implemented

### Finance and payments
- Quotes
- Invoices
- Payments
- Payment verification
- Financial reporting

### Certificates and awards
- Certificate records and issuance
- Certificate verification
- Awards

### Enquiries and applications
- Contact enquiries
- Training enrolments/applications
- Service enquiries

### Communication
- Support tickets
- Ticket messages
- Notifications and announcements

### Website and content management
- Services
- Posts/announcements
- Portfolio
- Media library

### Reports and analytics
- Operational reports
- User and enrolment reports
- Project and service reports
- Financial reports
- Exportable reports

### System management
- Profile and account security
- Role and permission controls
- Audit logs
- Email and storage configuration status
- Application and database health

### Help and account
- Support and documentation
- My profile
- Change password
- Sign out

## 4. Dashboard overview

The landing page should contain:
1. Welcome panel with the authenticated administrator's profile name, date, role, and last-login information only where the source exists.
2. KPI cards for users, students, clients, staff, enquiries, active/completed projects, services, enrolments, pending applications, invoices, pending payments, confirmed revenue, certificates, and support tickets. A card is shown only when its data can be computed from a verified source.
3. Date-filtered analytics: revenue trend, user registrations, enrolments, project status, payment status, application status, and service demand. Time-series charts require reliable timestamps and queries; do not substitute record totals for time-series data.
4. Recent activity from audit records, newest first.
5. Pending-work queues derived from real statuses.
6. Notifications and system-health indicators based on actual services.

## 5. Standard module page layout

Each implemented module page must have:
- Page title and explanation.
- Role-appropriate create/action controls.
- Search and filters supported by the backend.
- Sortable, paginated table.
- Clear status labels.
- View/edit actions only when corresponding APIs and permissions exist.
- Safe confirmation for destructive actions.
- CSV/PDF export only after the export data is authorised and correctly scoped.
- Loading, empty, error, and success states.

## 6. Security and access

- Better Auth cookie-based sessions.
- Server-side authorization on every protected endpoint.
- Least-privilege role/resource permissions.
- Never trust role values supplied by the browser.
- Super Admin has full access; staff roles receive only explicitly assigned resources.
- Audit sensitive actions.
- Do not expose secrets or private payment receipts.
- No destructive action without explicit user confirmation and server-side validation.

## 7. Visual design

- Professional, clean, responsive SaaS administration interface.
- Dark navy/charcoal sidebar; light neutral workspace; white cards with subtle borders.
- Inter/system sans-serif typography and consistent Lucide-style icons.
- Consistent spacing, button hierarchy, form controls, badges, tables, and chart legends.
- Desktop sidebar target width approximately 250–270px; compact mobile drawer.
- Support keyboard use and reduced-motion preferences.

## 8. Verified current staging data model

The current staging adapter allowlists these 20 application tables:
- `stc_audit_logs`
- `stc_awards`
- `stc_brand_signatures`
- `stc_certificates`
- `stc_enquiries`
- `stc_invoices`
- `stc_media`
- `stc_messages`
- `stc_notifications`
- `stc_payment_settings`
- `stc_payments`
- `stc_portfolio`
- `stc_posts`
- `stc_profiles`
- `stc_projects`
- `stc_quotes`
- `stc_services`
- `stc_staff_roles`
- `stc_tickets`
- `stc_training_enrollments`

The current app already has protected APIs for the management overview, profiles/students, staff roles, enquiries, projects, quotes, invoices, payments, tickets/messages, services, posts, portfolio, media, enrolments, certificates, awards, and CEO signature workflows.

Important model gaps to resolve before claiming the entire proposed business suite is implemented:
- There is no dedicated course catalogue, course-material, timetable, assessment, or attendance table in the current 20-table allowlist.
- There is no dedicated departments table.
- The current staff model is role assignments, not a full HR/staff employment record.
- The current user profile table is not a separate CRM client directory.
- A full notification centre, last-login history, configurable fine-grained permissions, and time-series reporting need schema/API verification or implementation.
- Any additional tables or columns must be designed from confirmed requirements and inspected Neon schema, with additive migrations only.

## 9. Delivery phases and acceptance criteria

### Phase 1 — Admin shell and dashboard overview
- Sidebar, header, responsive shell, navigation and overview.
- Real KPI values and recent records.
- Loading/empty/error states.
- Dashboard loads for the Super Admin and does not leak to other roles.

### Phase 2 — Existing operational modules
- Complete working views and appropriate CRUD workflows for the existing APIs.
- Search/filter/pagination where supported.
- Staff role assignment and server-enforced access.

### Phase 3 — Finance, communication, content and certificates
- End-to-end verification of existing workflows and safe actions.
- Private receipt access remains protected.
- Audit events for sensitive operations.

### Phase 4 — Reporting and analytics
- Real date-filtered aggregates and charts.
- Reconcile totals against underlying records.
- Exports respect authorization and selected filters.

### Phase 5 — New business modules and system administration
- Design additive Neon schema for missing modules only after requirements and existing schema are reviewed.
- Implement APIs, permissions, UI, validation, audit, and tests together.
- Health indicators must check real dependencies.

### Release acceptance
- Automated syntax/dependency checks pass.
- Protected API tests verify authorized and unauthorized roles.
- Dashboard and each module tested in staging.
- No fake data or dead-end menu items.
- Staging deploy confirmed live and smoke-tested.
- Production and the original Supabase source remain untouched until explicit approval.
