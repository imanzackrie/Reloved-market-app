-- google calendar. tokens only readable from edge functions (no client policies on purpose)
alter table public.tasks add column google_event_id text;

create table public.google_accounts (
  owner uuid primary key references auth.users(id) on delete cascade,
  email text,
  refresh_token text not null,
  calendar_id text not null default 'primary',
  connected_at timestamptz not null default now()
);
alter table public.google_accounts enable row level security;

create table public.oauth_states (
  state text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  return_to text not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.oauth_states enable row level security;
revoke all on public.google_accounts, public.oauth_states from anon, authenticated;
