-- Security hardening.
--
-- 1. Deny by default: the signed-out role (anon) gets no access to app data.
--    Row level security already stopped it reading anything; this removes the
--    grants underneath, so a future table with a loose policy is still safe.
-- 2. Two-step verification is enforced in the database, not just the app: a
--    student who turned it on can only reach their data from a session that
--    completed the second step (aal2), even if someone else has their password.
-- 3. security_events: an audit trail of security-relevant events, which also
--    backs per-student rate limits in the Edge Functions.
-- 4. Uploads only accept file types the app can actually read.

-- ── 1. Deny by default ────────────────────────────────────────────
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Searching material is for signed-in students only (it already runs with
-- their permissions, so it only ever sees their own chunks).
revoke execute on function public.match_material_chunks(extensions.vector, integer, uuid, uuid, double precision) from public, anon;
grant execute on function public.match_material_chunks(extensions.vector, integer, uuid, uuid, double precision) to authenticated;

-- The model health table is written by Edge Functions with the service role only.
revoke all on public.ai_model_health from authenticated;

-- ── 2. Two-step verification, enforced by row level security ───────
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- True when this session may see the student's data: either they have no
-- verified second factor, or this session completed the second step.
-- Security definer because auth.mfa_factors is not readable by students.
create or replace function private.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;
revoke all on function private.mfa_satisfied() from public;
grant execute on function private.mfa_satisfied() to authenticated;

-- A restrictive policy is ANDed with the existing "own rows" policies.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not in ('ai_model_health', 'security_events')
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()))',
      t || ': two-step verification', t);
  end loop;
end $$;

create policy "study-materials: two-step verification" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'study-materials' or (select private.mfa_satisfied()))
  with check (bucket_id <> 'study-materials' or (select private.mfa_satisfied()));

-- ── 3. Security events and rate limits ────────────────────────────
create table public.security_events (
  id bigint generated always as identity primary key,
  -- No foreign key: the trail outlives a deleted account.
  user_id uuid,
  kind text not null check (char_length(kind) between 1 and 64),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_user_kind_time on public.security_events (user_id, kind, created_at desc);
create index security_events_time on public.security_events (created_at);
alter table public.security_events enable row level security;
-- No policies: only the service role (Edge Functions) reads or writes it.
revoke all on public.security_events from anon, authenticated;
grant select, insert, delete on public.security_events to service_role;

-- Records one use of `p_kind` for a student and says whether it was allowed.
-- Two windows (e.g. per minute and per day); over either, nothing is used up
-- and a 'rate_limited' event is recorded instead. An advisory lock makes the
-- count-then-insert safe when requests arrive together.
create or replace function public.take_rate_limit(
  p_user uuid,
  p_kind text,
  p_short_limit integer,
  p_short_seconds integer,
  p_long_limit integer,
  p_long_seconds integer,
  p_detail jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  short_used integer;
  long_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_kind, 0));

  select count(*) filter (where created_at > now() - make_interval(secs => p_short_seconds)),
         count(*)
    into short_used, long_used
    from public.security_events
   where user_id = p_user and kind = p_kind
     and created_at > now() - make_interval(secs => greatest(p_short_seconds, p_long_seconds));

  if short_used >= p_short_limit or long_used >= p_long_limit then
    insert into public.security_events (user_id, kind, detail)
    values (p_user, 'rate_limited', jsonb_build_object('limit', p_kind) || coalesce(p_detail, '{}'::jsonb));
    return false;
  end if;

  insert into public.security_events (user_id, kind, detail)
  values (p_user, p_kind, coalesce(p_detail, '{}'::jsonb));

  -- Occasional tidy-up so the trail stays small: keep 90 days.
  if random() < 0.01 then
    delete from public.security_events where created_at < now() - interval '90 days';
  end if;
  return true;
end;
$$;
revoke all on function public.take_rate_limit(uuid, text, integer, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.take_rate_limit(uuid, text, integer, integer, integer, integer, jsonb) to service_role;

-- ── 4. Uploads: only what the app can read ────────────────────────
-- Legacy .ppt and .doc are rejected by the app, so the bucket refuses them too.
update storage.buckets
   set allowed_mime_types = array_remove(array_remove(allowed_mime_types, 'application/vnd.ms-powerpoint'), 'application/msword')
 where id = 'study-materials';
