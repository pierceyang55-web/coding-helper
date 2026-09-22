# Coding Helper

Photograph a LeetCode-style question on your phone. The answer streams
live to **every device signed into the same account** — your phone, your laptop, a second
monitor, whatever's open.

```
 phone camera ──▶ Supabase Storage ──▶ /api/solve ──▶ Claude
                        │                    │
                        └──── Postgres ◀─────┘
                                 │
                    Supabase Realtime broadcasts
                                 │
                 ┌───────────────┴───────────────┐
              phone                           desktop
```

## The two modes

**Medium** runs the moment you upload. **Fine** does not — it sits on its tab with a price on
it until you press the button, because it costs roughly six times as much (see *Cost* below).

| Tab | Model | Ceiling | Starts | What you get |
|---|---|---|---|---|
| **Medium** | `claude-sonnet-5` | 30s hard cut | automatically | Problem, approach, code, complexity, edge cases. Interview-ready. |
| **Fine** | `claude-opus-5` | 4 min | on demand | Brute force, key insight, correctness argument, code, test cases, follow-ups. |

The ceilings are enforced server-side with an `AbortController`. If a pass hits its limit,
whatever streamed so far is kept and the tab is marked ⏱ rather than thrown away.

Each finished pass reports what it actually cost, from the token counts the API returned —
so the number under the answer is measured, not estimated.

## Photos and languages

One problem can carry up to six photos: shoot a long question across several screens and they
are read together, in order, as one statement.

The interface is in Traditional Chinese or English, switchable in the header. That switch is a
static string table — it costs nothing. The *answer* language is fixed per submission at upload
time: in Chinese mode the model writes its explanation in Chinese but keeps every algorithm
name, complexity bound, heading and identifier in English, because that is the vocabulary an
English-language interview is conducted in.

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
2. Open **SQL Editor** and run these as **three separate queries**, in order (on an existing
   project, run `supabase/migrate.sql` too):
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
> **Settings → Functions** and raise the limit if Fine mode gets cut short. Medium is
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
supabase/schema.sql          Tables, RLS, realtime (fresh projects)
supabase/migrate.sql         Run this on an existing project before deploying
src/lib/modes.ts             ⭐ Models, budgets, prompts, prices, AUTO_MODES — tune here
src/lib/i18n.tsx             Interface strings, zh-TW / en
src/lib/supabase/            Browser / server / service-role clients
src/lib/image.ts             Client-side photo compression (1600px JPEG)
src/app/api/solve/route.ts   Vision call, streaming, throttled DB writes, timeout enforcement
src/components/Workspace.tsx Realtime subscriptions, upload flow, layout
src/components/ModeTabs.tsx  The tabs, with live timers and prices
src/components/ResultPanel.tsx  Streaming markdown + copy-able code
```

---

## Cost

Measured on a real 1600px photo of a LeetCode problem:

```
system prompt     1,076 tokens
photo             4,743 tokens   ← 81% of the input
──────────────────────────────
input             5,848 tokens  →  $0.012   (Sonnet, $2/MTok)
output            1,162 tokens  →  $0.012   (         $10/MTok)
Medium, one pass                   $0.023
```

The photo dominates the *input*, but input is cheap. What costs money is **output**, and Fine
spends most of its output on thinking tokens — which are billed at the output rate — on a model
that charges $25/MTok. One Fine pass is roughly $0.15, about six Mediums.

That is why only Medium starts by itself: an upload costs ~$0.02 instead of ~$0.18. Press the
Fine button on the problems that deserve it.

`AUTO_MODES` in `src/lib/modes.ts` controls which modes fire on upload. The prices the UI
quotes live next to it, in `PRICES` and `TYPICAL_COST`.

---

## Troubleshooting

**Nothing appears on the second device.** Check that `supabase/schema.sql` ran completely —
the `alter publication supabase_realtime add table ...` block is what enables sync. Confirm both
devices are on the same account.

**"Could not read the photo."** The service role key is wrong or missing. The solver reads from
a private bucket and needs it.

**Medium keeps timing out.** Usually a very large photo on a slow connection. The client
already downsizes to 1600px; you can lower it further in `src/lib/image.ts`.

**Magic link opens and bounces back to login.** The redirect URL isn't in Supabase's allow list,
or `NEXT_PUBLIC_SITE_URL` doesn't match where you're actually browsing.

**Blank tab, no error.** Open the browser console and the Vercel function logs — an invalid
`ANTHROPIC_API_KEY` surfaces as an error on the result row and shows in the tab.
