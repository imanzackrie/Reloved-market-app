# Architecture

How the pieces of Reloved.Market talk to each other. Diagrams are written in Mermaid so GitHub draws them.

- [Overview](#overview)
- [Logging in](#logging-in)
- [Loading the shop](#loading-the-shop)
- [AI help on a listing](#ai-help-on-a-listing)
- [Google Calendar sync](#google-calendar-sync)
- [Daily email](#daily-email)
- [Database](#database)
- [Shared shop for partners](#shared-shop-for-partners)
- [Deploying changes](#deploying-changes)

## Overview

```mermaid
flowchart TB
    subgraph Client["Browser (phone or laptop)"]
        UI["React app<br/>pages + store.jsx"]
    end

    subgraph Edge["Cloudflare Pages"]
        STATIC["index.html, JS, CSS, icons<br/>_headers (CSP, HSTS)"]
    end

    subgraph Supabase
        AUTH["Auth<br/>email + password + TOTP"]
        DB[("Postgres<br/>RLS on every table")]
        STORE[("Storage<br/>photos bucket, private")]
        subgraph Functions["Edge functions (Deno)"]
            F1["ai-listing"]
            F2["ai-threads"]
            F3["gcal / gcal-callback"]
            F4["daily-email"]
        end
        CRON["pg_cron<br/>7:40am MYT"]
    end

    subgraph Google
        GEM["Gemini"]
        CAL["Calendar API"]
        GM["Gmail API"]
    end

    Edge -->|loads app| Client
    UI --> AUTH
    UI --> DB
    UI --> STORE
    UI --> Functions
    F1 --> GEM
    F2 --> GEM
    F3 --> CAL
    F4 --> GM
    CRON --> F4
```

There's no server of my own. Cloudflare only hands out static files, and Supabase does login, data, files and the few bits of server code. The browser only ever holds the **publishable** Supabase key, which can't do anything the database rules don't allow.

## Logging in

Every account needs a password and a 6 digit code from an authenticator app. The session only counts as fully logged in (`aal2`) after the code.

```mermaid
sequenceDiagram
    actor Me
    participant App as React app
    participant Auth as Supabase Auth
    participant DB as Postgres

    Me->>App: email + password
    App->>Auth: signInWithPassword
    Auth-->>App: session (aal1)
    alt no authenticator yet
        App->>Auth: mfa.enroll (TOTP)
        Auth-->>App: QR code
        Me->>App: scan, type code
    else already set up
        Me->>App: 6 digit code
    end
    App->>Auth: mfa.challenge + verify
    Auth-->>App: session (aal2)
    App->>DB: load shop
    Note over DB: RLS checks aal2 + shop owner<br/>before returning any row
```

There's no sign up page and no "forgot password". New users are added by hand in the Supabase dashboard, and sign ups are switched off on the Supabase side too.

## Loading the shop

`src/lib/store.jsx` holds everything the pages need. On login it:

1. asks the database who the shop owner is (`shop_owner()`, so a partner gets the main shop)
2. loads the profile, listings, tasks and posts
3. turns photo paths into short lived signed links
4. checks if Google is connected

Pages read from the store and call its functions (`addTask`, `updateListing` and so on). Every change goes straight to Supabase and updates the screen right away, so there's no save button.

## AI help on a listing

```mermaid
sequenceDiagram
    actor Me
    participant App
    participant Fn as ai-listing
    participant Gemini

    Me->>App: photo + name, tap "AI help"
    App->>Fn: POST (with login token)
    Fn->>Fn: check token is aal2
    Fn->>Gemini: photo + prompt (Malaysian market, RM)
    alt model busy (429 / 503)
        Fn->>Gemini: wait, retry, then next model
    end
    Gemini-->>Fn: JSON price, range, title, description
    Fn-->>App: cleaned result
    App-->>Me: fills the form, I edit and save
```

The AI never saves anything by itself. It only fills the form, and I decide what to keep. `ai-threads` works the same way for Threads posts and hashtags.

## Google Calendar sync

Connecting is a normal Google OAuth flow. The refresh token is kept in `google_accounts`, a table the browser can't read at all.

```mermaid
sequenceDiagram
    actor Me
    participant App
    participant Gcal as gcal function
    participant Google
    participant Cb as gcal-callback
    participant DB as Postgres

    Me->>App: Settings, Connect
    App->>Gcal: connect
    Gcal->>DB: save one-time state (10 min)
    Gcal-->>App: Google consent link
    App->>Google: open consent screen
    Me->>Google: allow Calendar + Gmail
    Google->>Cb: code + state
    Cb->>DB: check and delete state
    Cb->>Google: swap code for tokens
    Cb->>DB: store refresh token
    Cb-->>App: back to Settings, connected
```

After that, adding, editing, ticking or deleting a task with "Google Calendar" on calls `gcal` to create, move or remove the matching event. Done tasks get a ✓ in front. Events I make directly in Google show in the planner as blue rows.

## Daily email

```mermaid
flowchart LR
    CRON["pg_cron<br/>23:40 UTC daily"] -->|POST + secret header| FN["daily-email"]
    FN -->|check secret in Vault| V[("Vault")]
    FN --> DB[("today's tasks,<br/>posts, listings")]
    FN -->|send as me| GM["Gmail API"]
    GM --> INBOX(["business inbox"])
```

The cron job runs inside Supabase, so the email goes out even when my laptop is off. The secret it sends is random, made when the migration ran, and only lives in Supabase Vault. The function also skips anyone who already got today's email, so it never sends twice.

## Database

```mermaid
erDiagram
    profiles ||--o{ listings : owns
    profiles ||--o{ tasks : owns
    profiles ||--o{ posts : owns
    profiles ||--o| google_accounts : connects
    profiles ||--o{ team_members : "has partners"

    profiles {
        uuid id PK
        text shop_name
        text business_email
        bool daily_email
    }
    listings {
        uuid id PK
        uuid owner FK
        text title
        text category
        numeric price
        text status
        text photo_path
    }
    tasks {
        uuid id PK
        uuid owner FK
        text title
        text kind
        date due_date
        bool done
        text google_event_id
    }
    posts {
        uuid id PK
        uuid owner FK
        text text
        array hashtags
        date scheduled_for
    }
    google_accounts {
        uuid owner PK
        text refresh_token
        text scopes
    }
    team_members {
        uuid member PK
        uuid owner FK
    }
```

There's also a small `oauth_states` table for the one-time Google login states. The full SQL is in `supabase/migrations`.

## Shared shop for partners

A partner is just a row in `team_members` that points their user id at the owner's. The function `shop_owner()` returns the owner's id for a partner, or your own id if you're not a partner. Every policy compares rows to `shop_owner()`, and new rows default to it, so both of us read and write the same shop without any extra code in the app.

## Deploying changes

```mermaid
flowchart LR
    VS["VS Code"] -->|git push| GH["GitHub main"]
    GH -->|webhook| CF["Cloudflare build<br/>npm run build"]
    CF --> LIVE(["live in ~1 min"])
    VS -->|supabase functions deploy| SF["Edge functions"]
```

Data never needs a deploy. Only code changes do.
