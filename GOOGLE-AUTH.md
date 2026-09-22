# Enabling Google sign-in

Three places to touch: Google Cloud Console, then Supabase, then `.env.local`.

The one value everything hinges on is your Supabase callback URL:

```
https://mqzfjurvypzzjmabkosn.supabase.co/auth/v1/callback
```

Google redirects to **Supabase**, not to your app. Supabase then forwards to
`http://localhost:3000/auth/callback`. Putting `localhost` in Google's redirect field is the
single most common mistake here and produces `redirect_uri_mismatch`.

---

## Part 1 — Google Cloud Console

Go to <https://console.cloud.google.com>.

### 1. Create a project

Project picker in the top bar → **New Project** → name it `coding-helper` → Create. Wait for it
to switch over, and check the top bar shows `coding-helper` before continuing.

### 2. Set up the consent screen

Left menu → **APIs & Services** → **OAuth consent screen**. (Newer consoles call this section
**Google Auth Platform**.) Click **Get started** and fill in:

- App name: `Coding Helper`
- User support email: your own address
- Audience: **External**
- Developer contact email: your own address

Agree to the policy and Create.

### 3. Add the scopes

**Data Access** → **Add or remove scopes**. Tick these three:

- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

Update → Save.

### 4. Add yourself as a test user

**Audience** → **Test users** → **Add users** → your Gmail address → Save.

Skipping this is the second most common failure: while the app is in Testing mode, Google
blocks every account that isn't listed here with "Access blocked: has not completed the Google
verification process". You don't need to publish or verify the app — for personal use, staying
in Testing with yourself as a test user is fine.

### 5. Create the OAuth client

**Clients** → **Create client**:

- Application type: **Web application**
- Name: `coding-helper-web`

**Authorized JavaScript origins:**

```
https://mqzfjurvypzzjmabkosn.supabase.co
http://localhost:3000
```

**Authorized redirect URIs** — exactly this, nothing else:

```
https://mqzfjurvypzzjmabkosn.supabase.co/auth/v1/callback
```

Create. A dialog shows your **Client ID** and **Client Secret**. Keep it open, or download the
JSON — you need both in the next step.

---

## Part 2 — Supabase

Dashboard → **Authentication** → **Sign In / Providers** → **Google**.

1. Toggle **Enable Sign in with Google** on.
2. Paste the **Client ID**.
3. Paste the **Client Secret**.
4. Save.

While you're here, confirm **Authentication → URL Configuration** has:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`

That's the hop *after* Google — Supabase refuses to forward to a URL that isn't listed.

---

## Part 3 — Turn the button on

Add this line to `.env.local`:

```
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true
```

Then **restart the dev server** — Ctrl+C, then `npm run dev`. Environment variables are read at
boot; hot reload won't pick this up.

Refresh <http://localhost:3000> and the Google button is back.

---

## When it goes wrong

**`redirect_uri_mismatch`**
Google's Authorized redirect URI isn't the Supabase callback. It must be
`https://mqzfjurvypzzjmabkosn.supabase.co/auth/v1/callback` — not your app's URL, no trailing
slash, `https` not `http`. Edits to this field can take a minute to propagate.

**"Access blocked: Coding Helper has not completed the Google verification process"**
You're not in the test users list. Part 1, step 4.

**"Unsupported provider: provider is not enabled"**
The Supabase toggle didn't save, or you saved it on a different project.

**Google succeeds, then you land back on the login page**
`http://localhost:3000/**` is missing from Supabase's Redirect URLs.

**The button still isn't showing**
`.env.local` wasn't saved, or the dev server wasn't restarted. It must read exactly
`NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` — the check is a strict string comparison, so `TRUE` or
`1` won't do it.

---

## When you deploy

Vercel gives you a new origin, so three things need updating:

1. Google → your OAuth client → add `https://your-app.vercel.app` to Authorized JavaScript
   origins. The redirect URI stays the Supabase callback — it does not change.
2. Supabase → URL Configuration → add `https://your-app.vercel.app/**` to Redirect URLs.
3. Vercel → Environment Variables → add `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`, and set
   `NEXT_PUBLIC_SITE_URL` to your Vercel URL. Redeploy.
