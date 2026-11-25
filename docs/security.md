# Security

This app holds my shop data, my Google connection and my partner's account, so I wanted it locked down properly even though it's a small project. Here's what's in place and why.

## What's public and what isn't

| Public (in this repo) | Private (never in this repo) |
|---|---|
| The app's code and design | Listings, tasks, posts and photos |
| Database structure and security rules | User accounts and passwords |
| Supabase project URL and **publishable** key | Gemini key, Google client secret, service role key |
| | Google refresh tokens, cron secret |

The publishable key is meant to be public. It's inside every copy of the app anyway, and on its own it can't read or change anything. Every request still has to pass login and the database rules below.

## Login

- Email + password, then a 6 digit code from an authenticator app (TOTP). Both accounts have it turned on.
- A session only counts as logged in after the code (`aal2`). The database and the server functions both check this, not just the app.
- No sign up page, and sign ups are turned off in Supabase. Accounts are added by hand.
- No "forgot password" link and no Google sign in, so there are fewer ways in. Passwords are only changed from the Supabase dashboard.

## Database

- Row level security is on for **every** table.
- Each policy checks two things: the session is `aal2`, and the row belongs to the shop (`owner = shop_owner()`).
- `google_accounts` and `oauth_states` have **no** policies at all. That means the browser can't touch them. Only the server functions can, with the service role key.
- `shop_owner()` runs as the caller (security invoker), so it can't be used to read someone else's data.

## Files

- Photos live in a private bucket called `photos`, in a folder per shop.
- The app shows them with signed links that expire after an hour.
- Storage policies only allow your own folder or your shop owner's folder.

## Server functions

- Every function that a user calls checks the login token and the `aal2` level before doing anything.
- Secret keys (Gemini, Google) only exist as Supabase secrets. They never reach the browser and they're not in this repo.
- Google OAuth uses a random one-time `state` that expires after 10 minutes and is deleted as soon as it's used.
- The return link after Google login is checked against an allow list.
- The daily email is triggered by pg_cron with a random secret kept in Supabase Vault. A wrong secret is refused, and calls without one need a full login.

## Website

Cloudflare sends these headers on every page (see `public/_headers`):

- **Content-Security-Policy:** scripts only from the site itself, data only to my Supabase project, no embedding, no plugins
- **Strict-Transport-Security:** HTTPS only, for two years
- **X-Frame-Options: DENY:** the app can't be put inside another site
- **X-Content-Type-Options, Referrer-Policy, Permissions-Policy:** the usual hardening

## Things I check now and then

- Supabase **Advisors → Security** for new warnings
- [securityheaders.com](https://securityheaders.com) for the site headers
- That sign ups are still off and both accounts still have 2-step on
- That no `.env` file or key ever gets committed (`.env` is in `.gitignore`)

## Found something?

If you spot a problem, please don't open a public issue. Message me on GitHub ([@imanzackrie](https://github.com/imanzackrie)) and I'll sort it out.
