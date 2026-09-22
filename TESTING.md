# How to test Coding Helper

Six stages. Each one ends with a specific thing you should see — if you don't see it, the
troubleshooting section at the bottom is indexed by symptom.

Everything below runs from `C:\Users\steve\Desktop\Claude\CodingHelper`.

---

## Stage 1 — Install (5 min)

Open PowerShell in the project folder:

```powershell
cd C:\Users\steve\Desktop\Claude\CodingHelper
node -v
```

You need **v20.9.0 or higher**. If it's lower or the command isn't found, install the LTS from
<https://nodejs.org> and reopen PowerShell.

```powershell
npm install
```

✅ **Expect:** a few hundred packages, no red `ERR!` lines. Warnings are fine.

---

## Stage 2 — Supabase project (10 min)

1. Sign up at <https://supabase.com/dashboard> and create a new project. Pick a region near you
   and save the database password somewhere (you won't need it, but Supabase will nag).
2. Wait ~2 minutes for it to finish provisioning.
3. Left sidebar → **SQL Editor** → **New query**.

Run these as **three separate queries**, in order. Don't paste them into one tab — the SQL
Editor runs a tab as a single transaction, so one failing statement silently rolls back
everything above it.

| # | File | Should produce |
|---|---|---|
| 1 | `supabase\schema.sql` | "Success. No rows returned." → `submissions` + `results` under Table Editor |
| 2 | `supabase\storage.sql` | A result grid showing the `problems` bucket and 3 policy rows |
| 3 | `supabase\verify.sql` | Seven rows, every one saying **PASS** |

`verify.sql` is the one that matters — it checks tables, RLS, realtime, the bucket, and the
storage policies, and each FAIL tells you which file to re-run.

If `storage.sql` prints a notice about permissions instead of creating the policies, that's a
known quirk on some projects — the bottom of `storage.sql` has the four-click dashboard version.
Do that, then re-run `verify.sql`.

---

## Stage 3 — Keys (5 min)

**Anthropic key:** <https://console.anthropic.com/settings/keys> → Create Key → copy it.
Make sure the account has credit on it, or every request will fail with a billing error.

**Supabase keys:** your project → **Project Settings** → **API Keys**. Copy three things:

| Dashboard label | Goes into |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / `publishable` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` / `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

Now rename the template and fill it in:

```powershell
Rename-Item ENV_TEMPLATE.txt .env.local
notepad .env.local
```

Replace every `...` with a real value. No quotes, no spaces around the `=`. Save.

**Auth redirect setup:** Supabase → **Authentication** → **URL Configuration**:

- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/**`

---

## Stage 4 — First run, desktop only (5 min)

You don't need your phone yet. Grab any LeetCode problem, screenshot it (Win+Shift+S), and save
it to your Desktop. A photo of a screen or a printed page works too — that's the real use case,
but a clean screenshot is the better first test.

```powershell
npm run dev
```

Open <http://localhost:3000>. You'll be bounced to `/login`.

Enter your email → **Email me a sign-in link** → open the link from your inbox.

✅ **Expect:** you land on the workspace. Left side: "New problem" card. Right side: three tabs
reading Fast / Medium / Fine, all showing "queued", and an empty state saying no problem
captured yet.

Click **Choose an existing image**, pick your screenshot.

✅ **Expect, in this order:**

| Time | What happens |
|---|---|
| ~0s | All three tabs flip to a counting timer |
| 2–8s | Fast tab starts streaming text, then shows `✓ 6.4s` (or similar) in green |
| ~10s | The problem title appears in the header bar |
| 15–30s | Medium finishes with headed sections and a code block |
| 40s–3min | Fine finishes — much longer, with a brute-force section and test cases |

Click between the tabs while they're running. Switching is instant and doesn't interrupt
anything — each pass writes independently.

Hover a code block → a **Copy** button appears top-right.

---

## Stage 5 — Cross-device sync (2 min)

This is the feature worth testing carefully. Easiest version first, no phone needed:

1. Keep the workspace open in your normal Chrome window.
2. Open a **second window**, go to `http://localhost:3000`, sign in with the same email.
3. Put the two windows side by side.
4. Upload an image in **one** of them.

✅ **Expect:** the other window jumps to the new problem on its own and streams all three
answers in near-lockstep. You didn't refresh anything — that's Supabase Realtime pushing row
changes to both.

Also worth trying: upload, then **close** the window you uploaded from. Reopen it. The answers
are all there — the work happens server-side and lives in Postgres, not in the browser tab.

---

## Stage 6 — Actually using your phone

Camera capture needs HTTPS, so deploy it. Free, about 5 minutes:

```powershell
npm i -g vercel
vercel
```

Accept the defaults. When it finishes you get a URL like `https://coding-helper-xyz.vercel.app`.

Then:

1. **Vercel dashboard** → your project → **Settings** → **Environment Variables**. Add all five
   from your `.env.local`, except set `NEXT_PUBLIC_SITE_URL` to your Vercel URL.
2. **Supabase** → Authentication → URL Configuration → add `https://your-url.vercel.app/**` to
   Redirect URLs, and set Site URL to your Vercel URL.
3. Back in Vercel: **Deployments** → ⋯ on the latest → **Redeploy**.

Now open the URL on your phone, sign in with the same email, and tap **Add to Home Screen** in
the browser menu so it opens like an app.

✅ **The real test:** open the same URL on your computer. Point your phone at a coding problem —
on a screen, in a book, on a whiteboard — and tap **Take a photo**. Watch your computer.

The problem should appear on the desktop and start streaming within a second or two, without
you touching the computer at all.

### Quicker alternative: your local network

If you'd rather not deploy yet:

```powershell
npm run dev:lan
ipconfig        # find your IPv4 address, e.g. 192.168.1.42
```

On your phone (same Wi-Fi): `http://192.168.1.42:3000`. Camera capture works; the Copy button
won't, because it isn't a secure origin. Windows Firewall may prompt the first time — allow it
for private networks.

---

## What to check on the output itself

Test with a problem you already know the answer to. Things worth judging:

- **Fast** — is the code actually correct and actually optimal, or did it grab the naive
  solution to save time? If it's cutting corners, raise `budgetMs` for `fast` in
  `src/lib/modes.ts`, or swap the model to `claude-sonnet-5`.
- **Fine** — does the correctness argument hold up? Are the test cases runnable as written?
- **Bad photos** — deliberately shoot one at an angle, in poor light, with the constraints cut
  off. The prompt tells all three modes to flag unreadable parts rather than invent them. That
  behaviour is worth confirming, because it's how you'll actually be shooting these.

---

## Troubleshooting by symptom

**`npm install` fails with a Node version error**
Node is below 20.9. Install the LTS and reopen PowerShell.

**Login link opens and dumps you back on `/login`**
The redirect URL isn't in Supabase's allow list, or `NEXT_PUBLIC_SITE_URL` doesn't match the
address in your URL bar. `localhost` and `127.0.0.1` count as different origins.

**All three tabs sit at "queued" forever**
The solve route never started. Look at the PowerShell window running `npm run dev` for a stack
trace — a missing or malformed `.env.local` value shows up here.

**Tabs go red with "This pass failed"**
The error text is shown in the tab. `authentication_error` means a bad `ANTHROPIC_API_KEY`;
`credit balance` means the Anthropic account needs funding.

**"Could not read the photo"**
`SUPABASE_SERVICE_ROLE_KEY` is wrong or missing. The solver reads from a private bucket and
needs the service key, not the anon key.

**Answers appear on one device but not the other**
Realtime isn't on — run `supabase\verify.sql` and look at the "realtime publication" row. If it
FAILs, go to Database → Publications → `supabase_realtime` and tick `submissions` and `results`
by hand. Also confirm both devices are on the same account (the header shows the email).

**Upload fails with "new row violates row-level security policy"**
The storage policies didn't get created. Run `verify.sql`; if "storage policies" FAILs, use the
dashboard fallback documented at the bottom of `supabase\storage.sql`.

**The `problems` bucket isn't in Storage after running the SQL**
Something later in the file errored and rolled the whole tab back. That's exactly why setup is
split into `schema.sql` and `storage.sql` — run them as separate queries, then `verify.sql`.

**Fine mode gets cut off at exactly 60s**
Vercel's function timeout on your plan is lower than the route asks for. Vercel → Settings →
Functions → raise Max Duration. Fast and Medium are unaffected.

**Everything works but the styling looks broken**
Tailwind v4 didn't compile. Stop the dev server, delete the `.next` folder, run `npm run dev`
again.

### Looking at the raw data

Supabase → SQL Editor, if you want to see what the server actually recorded:

```sql
select s.title, r.mode, r.status, r.elapsed_ms, length(r.content) as chars, r.error
from results r
join submissions s on s.id = r.submission_id
order by s.created_at desc, r.mode;
```

This is the fastest way to tell the difference between "the model failed" and "the UI isn't
updating" — if the rows look right here but the page doesn't, it's a realtime problem.
