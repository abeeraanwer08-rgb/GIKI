# HissabAI

**HissabAI** (*hisaab*, حساب — "accounts") is an AI-powered personal finance
copilot for Pakistan. Scan a receipt, bank statement, utility bill or wallet
screenshot; HissabAI reads it, categorises every expense, tracks it against your
budgets, forecasts your month, flags unusual spending, and answers questions
about your money in English, Urdu or Roman Urdu.

It ships as a **mobile app** (Expo / React Native) and a **website** (React) that
share one **FastAPI backend**.

> **This branch (`website`)** contains the backend and the complete website.
> The mobile app lives on the `mobile-app` branch.

---

## What it does

- **Accounts** — sign up / sign in with **email verification**, **password
  reset** by emailed code and **login rate limiting**; every user sees only
  their own data.
- **Scan documents** — receipts, **bank statements**, **invoices**, utility
  bills and EasyPaisa / JazzCash screenshots. Take a photo, upload an image, or
  upload a **PDF** — statements and invoices can span up to 12 pages.
- **Bank statements, row by row** — each spending transaction becomes its own
  expense with its own category; printed totals and running balances are
  cross-checked before saving; saving the same statement twice never
  double-counts. Printed dates in any common format (`05/09/2026`, `05-Sep`) are
  read in code, with the year taken from the statement period; rows with no
  printed date are flagged and their date can be edited.
- **Invoices** — vendor, invoice number, dates, line items, tax, discount and
  shipping are extracted and the line, subtotal and total maths is checked.
- **Review before saving** — correct anything the AI got wrong; totals are
  validated.
- **Budgets** — a monthly limit per category with on-track / warning / over
  status.
- **Insights** — spending by category and month, a month-end forecast, unusual
  spending flags and AI-written summaries, for any date range.
- **Bilingual assistant** — ask in English, Urdu script or Roman Urdu; answers
  use only your own numbers.
- **History** — paginated transaction list with date-range and category filters.

All numbers are computed deterministically in code; the LLM only reads receipts
and narrates the computed figures (ADR-0009, ADR-0010).

---

## What you need before running

The AI features need three things, all configured on the **backend** only:

| What | Env variable(s) | Where to get it |
|---|---|---|
| OpenAI API key | `OPENAI_API_KEY` | platform.openai.com (paid; the only part that costs money) |
| Supabase project | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | supabase.com (free tier is enough) |
| Login-token secret | `AUTH_JWT_SECRET` | make one up: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| Email sending (optional in development) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | any SMTP provider (Gmail app password, SendGrid, Brevo, Resend, ...) |

**Email in development:** with `SMTP_HOST` empty, the 6-digit verification and
reset codes are printed in the backend's console instead of being emailed, so you
can sign up and test everything without a mail account. To skip verification
entirely while developing, set `REQUIRE_EMAIL_VERIFICATION=false`. Real
deployments must configure SMTP.

Never put these keys in the mobile app or the website, and never commit them.

**Supabase setup:** open your project's SQL editor and run the files in
`supabase/migrations/` **in order**:

1. `20260811000000_create_financial_records.sql`
2. `20260923000000_create_budgets.sql`
3. `20260924000000_add_users_and_ownership.sql` (users + per-user ownership;
   rows saved before this migration have no owner and are not shown)
4. `20261002000000_auth_hardening.sql` (email verification, reset codes, session
   revocation; existing accounts are treated as already verified)

---

## 1. Run the backend (required by both apps)

Requirements: Python 3.11+.

```bash
cp .env.example .env              # then fill in the values from the table above
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install fastapi httpx openai opencv-python-headless pymupdf pyjwt python-multipart uvicorn
# (or, with uv:  uv sync)

set -a && source .env && set +a   # load the variables into your shell
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Check it: `curl http://localhost:8000/health` → `{"status":"ok"}`.
Interactive API docs: <http://localhost:8000/docs>.

The website runs in a browser, so the backend must allow its address. The
defaults allow the local dev server (`http://localhost:5173`) and `vite preview`
(`http://localhost:4173`). For a deployed site set
`CORS_ALLOW_ORIGINS=https://your-site.example.com` before starting the backend.


## 2. Run the website

Requirements: Node.js 20+.

```bash
cd web
npm install
cp .env.example .env        # set VITE_API_URL if your backend is not on http://localhost:8000
npm run dev                 # http://localhost:5173
```

Open <http://localhost:5173>: landing page → **Get started** → create an account
→ enter the emailed 6-digit code (in development it is printed in the backend
console) → dashboard. Use **Add** to upload a receipt, invoice or bank statement —
an image, several page images, or a PDF (drag and drop works) — review it, and
save. **Forgot password?** on the sign-in page resets it by emailed code.

Production build and local preview:

```bash
npm run build               # type-checks, then writes dist/
npm run preview             # serves dist/ at http://localhost:4173
```

`dist/` is a static site (hash-routed, so no server rewrites are needed): host it
on Netlify, Vercel, GitHub Pages or any static host. Set `VITE_API_URL` to your
public backend URL **when building**, and set `CORS_ALLOW_ORIGINS` on the backend
to the site's address.

Tests: `npm test` · Type-check: `npm run typecheck`.

---

## Tests

```bash
cd backend && python -m unittest discover -s tests -p "test_*.py" -t tests
```

Website: `cd web && npm test`.

---

## Repository layout

```
backend/        FastAPI backend: routes/, services/, parsers/, schemas/, prompts/, tests/
supabase/       SQL migrations
docs/           Architecture, API contract and decision records (ADRs)
web/            React + Vite website
```

Documentation: [`docs/api-contract.md`](docs/api-contract.md) ·
[`docs/architecture.md`](docs/architecture.md) · [`docs/adr/`](docs/adr) ·
[`progress-log.md`](progress-log.md).

---

## Credits and contributions

HissabAI builds on **KharchAI**, an earlier team codebase used with its
authors' permission. It provided the FastAPI document pipeline (receipt,
utility-bill and wallet-screenshot parsing, validation, confidence scoring,
review hints), Supabase persistence, and the original Expo mobile app (receipt
capture, review and save flow). The original commit history is preserved in
this repository.

Work added on top of that base:

- **AI financial reasoning layer** — deterministic calculations plus
  LLM-generated insights, recommendations and grounded Q&A (ADR-0009).
- **Smart categorisation, budgets, forecast and unusual-spending detection**
  (ADR-0010).
- **Bilingual AI assistant** (English, Urdu, Roman Urdu).
- **Accounts and per-user data** — scrypt passwords, signed tokens, every route
  protected and scoped (ADR-0011).
- **Bank statement parsing** with deterministic balance checks and per-row
  expenses, **date-range filtering** and **pagination** (ADR-0012).
- **Auth hardening** — emailed-code email verification and password reset,
  session revocation, login/sign-up/reset rate limiting (ADR-0013).
- **Multi-page PDFs and photos, invoices, a vision-model document classifier and
  robust statement dates** (ADR-0014).
- **Mobile redesign** — design system, motion, haptics, scan-type picker,
  statement review.
- **The website** — landing page and a full web app (dashboard, transactions,
  upload and review, budgets, insights, assistant).

---

## Known limitations

- Rate-limit counters live in the backend process, which is right for a single
  worker; with several workers each keeps its own counts (swap
  `services/rate_limit.py` for Redis or the database before scaling out).
- No two-factor authentication, and email delivery depends on your SMTP provider.
- Statements and invoices are limited to 12 pages and 10 MB per file (25 MB
  total). PDFs are rendered to images and read visually; password-protected PDFs
  are refused.
- The vision-model classifier adds one small extra call to an auto-detected
  upload. A mostly-white page photographed *without* choosing "Bank statement" or
  "Invoice" may be rejected as overexposed, because receipts are judged more
  strictly; choosing the type fixes it.
- A statement date that is printed but unreadable stays blank (and is flagged)
  rather than being guessed; undated rows take the previous row's date and are
  flagged for you to check.
- Saved expenses cannot yet be edited or deleted from the apps.
