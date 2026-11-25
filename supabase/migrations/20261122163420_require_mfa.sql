-- must finish 2-step login before reading any data
create policy "require mfa" on public.profiles as restrictive for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "require mfa" on public.listings as restrictive for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "require mfa" on public.tasks as restrictive for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "require mfa" on public.posts as restrictive for all to authenticated using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "require mfa photos" on storage.objects as restrictive for all to authenticated using (bucket_id <> 'photos' or (select auth.jwt()->>'aal') = 'aal2') with check (bucket_id <> 'photos' or (select auth.jwt()->>'aal') = 'aal2');
