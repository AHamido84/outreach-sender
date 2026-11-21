# Task
Build **Outreach Sender**: a simple web app to send cold emails for multiple companies, using **Google Sheets as the database**.

- **One Google Sheet = one company.** The sheet holds everything: company info, sender email settings, templates, monday.com board settings, contacts, send status, schedule and logs.
- **The web app does everything:** it creates and maps the sheet structure, edits all settings, shows the data and send status, sends manually or on a schedule, detects replies and bounces, and pushes sent contacts to monday.com.
- No Apps Script and no other database. Keep it simple to use: someone non-technical should run it after a 10-minute setup.

# Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, deployed on Vercel.
- Google Sheets API v4 with a **service account** (each company sheet is shared with its email as Editor).
- Email: **SMTP** for sending (nodemailer) and **IMAP** for reading replies and bounces (imapflow). Works with Gmail / Google Workspace (App Password), Outlook, Zoho, or any provider.
- monday.com GraphQL API.
- UI: Arabic, RTL, clean and mobile friendly. All copy in `content/ar.ts`.

# Environment variables (the only config outside the sheets)
- `GOOGLE_SERVICE_ACCOUNT_JSON`: the service account key (JSON string).
- `REGISTRY_SHEET_ID`: a small Google Sheet listing the companies (tab `Companies`: Name | Sheet URL | Color | Active).
- `APP_PASSWORD`: a simple login password for the app (signed httpOnly cookie session).
- `APP_SECRET`: used to encrypt secrets stored in the sheets, and to sign the session.
- `CRON_SECRET`: protects the scheduler endpoint.

# Sheet structure (created automatically by the app)
When I add a company (paste the sheet URL), the app checks access and runs **"Initialize sheet"**. That creates any missing tabs and headers, without touching existing data. A **"Repair sheet"** button runs the same thing later. Tab and column names are in English (stable for code). Every tab has a frozen bold header row and RTL view.

1. **`Company`** (key | value | description): Company Name, Website, Phone, WhatsApp, Address, Short Description, Profile Link, Booking Link, Logo URL, Signature (multi-line).
2. **`Sender`** (key | value | description):
   - From Name, From Email, Reply-To
   - SMTP Host, SMTP Port, SMTP Secure (yes/no), SMTP User, SMTP Password
   - IMAP Host, IMAP Port, IMAP User, IMAP Password (default = same as SMTP)
   - Daily Limit, Emails Per Run, Delay Between Emails (seconds)
   - Send Days, Send Start Hour, Send End Hour, Timezone
   - Auto Sending (on/off), Max Bounce Rate, Unsubscribe Line
3. **`Monday`** (key | value | description): API Token, Board ID, Group ID, Create Item On (first send / import / never), Update Status On Reply (yes/no), and a **column mapping** section: rows of `Field | monday Column ID` (email, status, step, last sent, next send, company, person, phone, website, city, industry, source, notes).
4. **`Templates`**: Template ID | Name | Language (AR/EN) | Step (0 = first email, 1, 2… = follow-ups) | Delay Days (after the previous step) | Subject | Body | Version (A/B) | Active.
   - Variables like `{first_name}`, `{company}`, `{city}`, `{industry}`, `{sender_name}`, `{our_company}`, `{profile_link}`, `{booking_link}`, `{signature}`, `{unsubscribe}`. Plus any Contacts column header as `{column_name}`.
5. **`Contacts`**:
   - **Contact data:** ID | Added At | Source | Company | Contact Name | Title | Email | Phone | Website | Industry | City | Country | Language | Tags.
   - **Send state:** Status (New / Ready / Sent / Follow-up N / Replied / Bounced / Unsubscribed / Completed / Invalid / Duplicate) | Step | Version | Last Sent At | Next Send At | Last Message ID | Thread References.
   - **monday:** monday Item ID | monday Status (Synced / Failed: reason / —).
   - **Other:** Error | Notes.
6. **`Send Log`**: Time | Run ID | Run Type (manual / scheduled / auto) | Contact ID | Email | Template | Step | Result (Sent / Failed / Preview / Skipped) | Error | Message ID | monday Result | monday Error.
7. **`Schedule`**: Run ID | Run At | Count | Filter (tags / language / IDs) | Status (Pending / Running / Done / Failed / Cancelled) | Result | Created At.
8. **`Do Not Contact`**: Email or Domain | Reason | Added At.
9. **`Activity`**: Time | Action | Details. Every settings change, import, run and error is logged here.

**Secrets in the sheet:** SMTP/IMAP passwords and the monday token are written **encrypted** (AES-256-GCM with `APP_SECRET`, stored as `enc:...`). The page shows only "saved ✓ ••••1234" and never sends them to the browser. If someone types a plain value directly in the sheet, the app accepts it and re-saves it encrypted.

# Pages
1. **Login (`/login`):** the password from `APP_PASSWORD`.
2. **Companies (`/`):** cards for each company from the Registry (name, color, today's sent / limit, auto on/off, last run, warnings).
   - "Add company": name + sheet URL → test access (show the service account email to share with, with a copy button) → Initialize sheet → open it.
3. **Company dashboard (`/c/[id]`):**
   - KPIs: total contacts, ready, sent today / daily limit, sent this week, replies, bounces, bounce rate, monday synced / failed.
   - A chart of sends per day (last 14 days).
   - The funnel Sent → Replied.
   - The next scheduled runs, the latest activity, and warnings (sender not tested, monday failing, bounce rate high, auto sending off).
4. **Contacts (`/c/[id]/contacts`):**
   - A table with search, filters (status, tags, language, source, monday status) and pagination.
   - Inline edit, bulk actions (set tags, mark Ready, move to Do Not Contact, retry monday, delete), and export CSV.
   - **Import:**
     1. Upload CSV/XLSX or paste.
     2. **Column mapping** to the Contacts columns, auto-suggested by header name (Arabic and English synonyms). Remember the last mapping per source in the sheet (a small `Mappings` tab).
     3. Preview with counts: valid / invalid email / duplicate (same email, or same company domain) / in Do Not Contact.
     4. Append to the sheet. Clean emails (lowercase, trim, pick the email matching the website domain when a cell has several).
5. **Templates (`/c/[id]/templates`):**
   - An editor for the sequence (step 0 + follow-ups with delay days), A/B versions, variable chips.
   - A **live preview with a real contact** (RTL/LTR by language) and a warning for variables with no value.
   - "Send test to me".
6. **Send (`/c/[id]/send`):**
   - **Manual send:** choose a count or select contacts, or a filter.
     - **Preview** shows exactly who gets which template.
     - **Send** asks for confirmation, then shows **live progress** (streaming or polling). For each contact: ✓/✗ sent, the error, and ✓/✗ monday with a link to the item and a Retry button.
   - **Schedule:** add a one-off run (date/time + count + filter), and see / cancel upcoming runs.
   - **Auto sending:** on/off, days, hours, daily limit, per run, delay. This is the same data as the Sender tab.
7. **Settings (`/c/[id]/settings`)**, tabs mapped 1:1 to the sheet:
   - **Company:** the Company tab.
   - **Sender email:** the Sender tab fields.
     - **"Test SMTP"** and **"Test IMAP"** buttons with clear Arabic errors.
     - **"Send test email"**.
     - A **deliverability check** on the From domain with Node `dns`: SPF, DKIM (selector field, default `google`), DMARC and MX, each ✓/⚠/✗ with a one-line fix.
     - A note for Gmail: use an App Password, and how to create it.
   - **monday:**
     - Token (write-only), Board ID or board URL.
     - **"Load board"** fetches the groups and columns, and lets me map fields to columns from dropdowns. It also offers to create missing columns.
     - **"Test"** creates and deletes a test item.
   - **Do Not Contact:** a list editor.
   - **Advanced:** open the sheet, Repair sheet, and remove the company from the Registry.
8. **Activity (`/c/[id]/activity`):** Send Log + Activity, with filters.

# Sending logic (shared by manual, scheduled and auto runs)
- Pick contacts in this order:
  1. Due follow-ups (Status Sent/Follow-up N, Next Send At ≤ now, no reply).
  2. Then Ready/New contacts with a valid email, not in Do Not Contact, not duplicate.
- Respect the Daily Limit (count today's Sent rows in Send Log, in the company timezone) and the send window (days/hours). A manual run may override the window after confirmation, but never the daily limit or Do Not Contact.
- Choose the template for the contact's next step and language. A/B is chosen by contact ID for step 0 and kept for follow-ups.
- Render the variables, and refuse to send if any variable is empty.
- Send via SMTP with a proper From name, Reply-To, `List-Unsubscribe` header, and plain-text + HTML (RTL for Arabic) parts.
- **Follow-ups go in the same thread:** set `In-Reply-To` and `References` from the stored message IDs and use "Re: <first subject>".
- After each email:
  - update the contact row (Status, Step, Version, Last Sent At, Next Send At, Message ID, Thread References)
  - append to Send Log
  - wait the configured delay
- **monday:** on first send (or as configured), create the item if missing and update the mapped columns. If monday fails, the email still counts as sent. Record `monday Status = Failed: reason` and show it, with Retry.
- **Bounce guard:** if the bounce rate is above the max (after ≥20 sends), switch Auto Sending off and show a warning.
- Use a per-company lock (a `Lock` cell in the Sender tab with a timestamp) so two runs never send at the same time.

# Scheduler
- `GET /api/cron?key=CRON_SECRET` runs every 5–10 minutes. For each active company it:
  1. runs due Schedule rows
  2. runs an auto batch if Auto Sending is on and inside the window
  3. **checks the inbox through IMAP** for replies and bounces
- Replies are matched by `In-Reply-To`/`References` or the sender address → Status Replied, follow-ups stop, monday status updated.
- Bounces (mailer-daemon / DSN) → Status Bounced and added to Do Not Contact.
- Replies like "لا / no / unsubscribe / stop" → Unsubscribed and added to Do Not Contact.
- Each cron call must finish within the function time limit: small batches, and stop early and continue next time.
- Vercel Hobby cron only runs daily, so **also include a GitHub Actions workflow** (`.github/workflows/cron.yml`) that calls the endpoint every 10 minutes using the repo secrets `CRON_URL` and `CRON_SECRET`. Document both options.

# Automatic sending (first-class feature)
Once a company is set up, sending must run **fully automatically** with no clicks:
- **Turning it on:** one big **Auto Sending** switch on the company dashboard and on the Send page (stored in the Sender tab as `Auto Sending = on/off`).
- **What runs on its own,** every scheduler tick (every 10 minutes):
  - new contacts that are Ready get their first email
  - due follow-ups go out on their day, in the same thread
  - replies, bounces and unsubscribes are detected and stop the sequence
  - monday is updated
  - scheduled one-off runs execute at their time
- **Pacing:** spread the Daily Limit evenly across the send window (e.g. 30/day in a 9–13 window → ~1 email every 8 minutes) instead of sending them all at once. Never exceed `Emails Per Run`, the Daily Limit, or the window. Skip days that aren't in Send Days.
- **Auto Sending panel**, on the dashboard and the Send page:
  - status: running / paused / outside window / daily limit reached / stopped by bounce guard / sender not configured
  - next run time
  - today's progress (sent / limit)
  - the last run's result with a link to its Send Log rows
  - a forecast: how many days until the current Ready contacts are all contacted at this pace
  - Pause/Resume, plus "Run now" (one batch immediately, still respecting the limits)
- **Safety:** auto sending refuses to start until the sender passes Test SMTP and at least one active step-0 template exists for each language in use. It turns itself off (with a visible warning and an Activity entry) on a high bounce rate, a repeated SMTP auth failure (3 runs in a row), or an empty template variable.
- **Scheduler setup:** the app ships the GitHub Actions workflow `.github/workflows/cron.yml` (every 10 minutes) and a "Scheduler health" indicator (last cron call time). It warns if no cron call happened in the last 30 minutes and explains how to fix it.

# Google Sheets access rules
- Find columns **by header name**, never by position, so I can reorder or add columns in the sheet.
- Use batchGet/batchUpdate, cache reads for ~20s, retry 429 with backoff.
- Keep phone numbers and IDs as text.
- Update only the cells that changed, and append new rows. Never rewrite a whole tab.

# Quality
- Friendly Arabic errors, with technical detail in an expandable section. Loading and empty states.
- Confirmation dialogs before sending or deleting.
- Unit tests for template rendering, email cleaning/dedup, contact selection (follow-ups first, limits, window, timezone), the encryption helpers, and reply/bounce detection.
- A **demo mode** (`DEMO=1`) with an in-memory fake sheet and a fake SMTP/IMAP/monday, so the whole UI can be tried without real accounts.
- Update `README.md` in Arabic, step by step:
  1. Create the service account and enable the Sheets API.
  2. Create the Registry sheet.
  3. Deploy to Vercel and set the env vars.
  4. Set up the cron (GitHub Actions).
  5. Add a company.
  6. Gmail App Password.
  7. monday token.
  8. First test send.

# Git & deployment
- Work on a branch, commit in small logical steps with clear messages, and open a PR when each workflow step is ready for review.
- Never commit secrets: `.env*` must be in `.gitignore`, and `.env.example` documents the variables only.
- The repo will be connected to Vercel (Git integration). Keep the build passing on every push, and use demo mode for Preview deployments if real env vars aren't set.

# Workflow
1. Propose the sheet structure, the page map and the sending logic briefly, and wait for my approval.
2. Build in demo mode and show me screenshots.
3. Connect one real company and test a real send to my own email.
4. Write the README.
