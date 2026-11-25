-- tables, rls, photo bucket
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'there',
  shop_name text not null default 'Reloved.Market',
  avatar_path text,
  business_email text,
  daily_email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  category text not null default 'furn' check (category in ('furn','elec','home','motor','pets')),
  condition text,
  price numeric(10,2) check (price >= 0),
  was_price numeric(10,2) check (was_price >= 0),
  cost numeric(10,2) check (cost >= 0),
  status text not null default 'draft' check (status in ('draft','planned','listed','sold')),
  sold_price numeric(10,2),
  sold_at timestamptz,
  likes integer not null default 0,
  carousell_id text,
  carousell_url text,
  photo_url text,
  photo_path text,
  posted_fb boolean not null default false,
  posted_cr boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, carousell_id)
);
create index listings_owner_status_idx on public.listings(owner, status);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'LISTING' check (kind in ('MEETUP','LISTING','THREADS','SOURCING','CALENDAR')),
  due_date date not null default current_date,
  due_time time,
  notes text,
  done boolean not null default false,
  in_google_calendar boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_owner_date_idx on public.tasks(owner, due_date);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 600),
  topic_tag text,
  hashtags text[] not null default '{}',
  scheduled_for date,
  status text not null default 'draft' check (status in ('draft','approved','posted')),
  created_at timestamptz not null default now()
);
create index posts_owner_date_idx on public.posts(owner, scheduled_for);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.tasks enable row level security;
alter table public.posts enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own listings" on public.listings for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "own tasks" on public.tasks for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "own posts" on public.posts for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(split_part(new.email, '@', 1), 'there'));
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp']);

create policy "own photos read" on storage.objects for select to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos insert" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos update" on storage.objects for update to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
