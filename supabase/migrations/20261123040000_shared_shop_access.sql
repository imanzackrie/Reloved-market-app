-- let a partner work on the same shop data as the owner
create table public.team_members (
  member uuid primary key references auth.users(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  check (member <> owner)
);
alter table public.team_members enable row level security;
create policy "see own membership" on public.team_members for select to authenticated
  using (member = (select auth.uid()) or owner = (select auth.uid()));

-- whose shop am I working on? the owner I belong to, or myself
create or replace function public.shop_owner()
returns uuid language sql stable security invoker set search_path = '' as $$
  select coalesce((select owner from public.team_members where member = auth.uid()), auth.uid());
$$;
revoke execute on function public.shop_owner() from public, anon;
grant execute on function public.shop_owner() to authenticated;

-- new rows go to the shop owner
alter table public.listings alter column owner set default public.shop_owner();
alter table public.tasks alter column owner set default public.shop_owner();
alter table public.posts alter column owner set default public.shop_owner();

drop policy "own listings" on public.listings;
drop policy "own tasks" on public.tasks;
drop policy "own posts" on public.posts;
create policy "shop listings" on public.listings for all to authenticated using (owner = (select public.shop_owner())) with check (owner = (select public.shop_owner()));
create policy "shop tasks" on public.tasks for all to authenticated using (owner = (select public.shop_owner())) with check (owner = (select public.shop_owner()));
create policy "shop posts" on public.posts for all to authenticated using (owner = (select public.shop_owner())) with check (owner = (select public.shop_owner()));

-- photos: my own folder (avatar) or the shop folder (listing photos)
drop policy "own photos read" on storage.objects;
drop policy "own photos insert" on storage.objects;
drop policy "own photos update" on storage.objects;
drop policy "own photos delete" on storage.objects;
create policy "shop photos read" on storage.objects for select to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] in ((select auth.uid())::text, (select public.shop_owner())::text));
create policy "shop photos insert" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] in ((select auth.uid())::text, (select public.shop_owner())::text));
create policy "shop photos update" on storage.objects for update to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] in ((select auth.uid())::text, (select public.shop_owner())::text));
create policy "shop photos delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] in ((select auth.uid())::text, (select public.shop_owner())::text));

-- to add a partner, run this once in the sql editor with the real user ids:
-- insert into public.team_members (member, owner) values ('<partner user id>', '<owner user id>');
