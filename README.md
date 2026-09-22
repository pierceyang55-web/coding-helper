# Coding Helper

Photograph a LeetCode-style question on your phone. Three solutions start at once and stream
live to **every device signed into the same account** — your phone, your laptop, a second
monitor, whatever's open.

```
 phone camera ──▶ Supabase Storage ──▶ /api/solve ×3 ──▶ Claude
                        │                    │
                        └──── Postgres ◀─────┘
                                 │
                    Supabase Realtime broadcasts
                                 │
                 ┌───────────────┴───────────────┐
              phone                           desktop
```

## The three modes

All three fire the moment you upload. You switch between them with tabs while they're still
running — Fast is usually readable before you've put your phone down.

| Tab | Model | Ceiling | What you get |
|---|---|---|---|
| **Fast** | `claude-haiku-4-5` | 10s hard cut | Approach in one line, optimal code, complexity. Nothing else. |
| **Medium** | `claude-sonnet-5` | 30s hard cut | Problem, approach, code, complexity, edge cases. Interview-ready. |
| **Fine** | `claude-opus-5` | 4 min | Brute force, key insight, correctness argument, code, test cases, follow-ups. |

The ceilings are enforced server-side with an `AbortController`. If a pass hits its limit,
whatever streamed so far is kept and the tab is marked ⏱ rather than thrown away.

Tuning lives in one file: **`src/lib/modes.ts`** — models, time budgets, effort levels and the
prompts are all there.

---

## Setup

### 0. Prerequisites

- Node.js **20.9+** (Next.js 16 requires it) — `node -v`
- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- A free [Supabase](https://supabase.com) project

### 1. Install

```bash
cd CodingHelper
npm install
```

### 2. Create the Supabase backend

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** and run these as **three separate queries**, in order:
   - `supabase/schema.sql` — tables, row-level security, realtime publication
   - `supabase/storage.sql` — the private `problems` bucket and its access policies
   - `supabase/verify.sql` — a seven-row checklist; every row should say PASS

   They're split because the SQL Editor treats one tab as one transaction: a permission error in
   the storage section would roll the tables back too, leaving you with nothing and no obvious
   error. If the storage policies can't be created from SQL on your project, `storage.sql` says
   so and documents the dashboard equivalent at the bottom of the file.
3. Go to **Project Settings → API** and copy:
   - Project URL
   - the **anon / publishable** key (safe for the browser)
   - the **service_role / secret** key (server only — never commit it)

### 3. Configure auth redirects

**Authentication → URL Configuration**:

- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/**` and, once deployed, `https://your-app.vercel.app/**`

Email magic links work out of the box. For Google sign-in, enable the Google provider under
**Authentication → Providers** and paste in an OAuth client ID/secret from Google Cloud Console.
(If you skip this, the Google button just won't work — magic links are enough.)

### 4. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=...            # or SUPABASE_SECRET_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Newer Supabase projects label these "publishable" and "secret" — either naming works.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, sign in, and drop in an image to check the whole loop works.

---

## Using it from your phone

**Deploy it (recommended).** The camera and clipboard need HTTPS, and you want this working
away from your home network anyway:

```bash
npm i -g vercel
vercel
```

Add all five environment variables in the Vercel dashboard (**Settings → Environment
Variables**), set `NEXT_PUBLIC_SITE_URL` to your deployed URL, add that URL to Supabase's
redirect list, and redeploy. Then open the URL on your phone, sign in with the same account,
and add it to your home screen.

> **Function timeout.** Fine mode can run for minutes. Vercel's default per-function limit is
> shorter than that on some plans — the route already declares `maxDuration = 300`, but check
> **Settings → Functions** and raise the limit if Fine mode gets cut short. Fast and Medium are
> unaffected.

**Or test over your LAN** — quicker, but only at home:

```bash
npm run dev:lan
```

Then visit `http://<your-computer-ip>:3000` on your phone. Camera capture works; the clipboard
copy button may not, since it isn't a secure context.

---

## How the sync actually works

There's no socket server to run. The solver route writes streamed text into the `results` table
roughly every 400ms, and Supabase Realtime pushes each row change to every subscribed client.
Postgres is the single source of truth, so:

- A phone that goes to sleep mid-solve loses nothing — the answer is waiting when it wakes.
- A laptop opened ten minutes later gets the full history.
- A photo taken on one device auto-selects itself on all the others.

Row-level security scopes every row to `auth.uid()`, so accounts can only ever see their own
problems.

---

## Project layout

```
proxy.ts                     Session refresh + route protection (Next 16 renamed middleware → proxy)
supabase/schema.sql          Tables, RLS, realtime, storage bucket
src/lib/modes.ts             ⭐ Models, time budgets, effort, prompts — tune here
src/lib/supabase/            Browser / server / service-role clients
src/lib/image.ts             Client-side photo compression (1600px JPEG)
src/app/api/solve/route.ts   Vision call, streaming, throttled DB writes, timeout enforcement
src/components/Workspace.tsx Realtime subscriptions, upload flow, layout
src/components/ModeTabs.tsx  The three tabs with live timers
src/components/ResultPanel.tsx  Streaming markdown + copy-able code
```

---

## Cost

Every upload runs all three models. Roughly: Fast is negligible, Medium is a few cents, Fine is
the expensive one. If that's more than you want per photo, the cheapest change is in
`Workspace.tsx` — drop `MODE_ORDER` from the kick-off loop to `['fast', 'medium']` and let the
`↻` button start Fine on demand only.

---

## Troubleshooting

**Nothing appears on the second device.** Check that `supabase/schema.sql` ran completely —
the `alter publication supabase_realtime add table ...` block is what enables sync. Confirm both
devices are on the same account.

**"Could not read the photo."** The service role key is wrong or missing. The solver reads from
a private bucket and needs it.

**Fast mode keeps timing out.** Usually a very large photo on a slow connection. The client
already downsizes to 1600px; you can lower it further in `src/lib/image.ts`.

**Magic link opens and bounces back to login.** The redirect URL isn't in Supabase's allow list,
or `NEXT_PUBLIC_SITE_URL` doesn't match where you're actually browsing.

**Blank tab, no error.** Open the browser console and the Vercel function logs — an invalid
`ANTHROPIC_API_KEY` surfaces as an error on the result row and shows in the tab.
