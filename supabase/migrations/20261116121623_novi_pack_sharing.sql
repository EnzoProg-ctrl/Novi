-- Sharing study packs by link. A link holds one or more packs and expires.
-- Opening it copies the packs into the receiver's own account (Shared with
-- Me), so their practice and progress work like their own packs. Receivers
-- never read the sender's rows: the share-packs function does the copying.

create table public.pack_shares (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) >= 20),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The sender's display name when the link was made, shown to receivers.
  sender_name text not null check (char_length(sender_name) between 1 and 80),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index pack_shares_user_idx on public.pack_shares (user_id, created_at desc);
comment on table public.pack_shares is 'A share link for one or more of a student''s study packs.';

create table public.pack_share_items (
  share_id uuid not null references public.pack_shares(id) on delete cascade,
  study_set_id uuid not null references public.study_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (share_id, study_set_id)
);
comment on table public.pack_share_items is 'Which packs a share link holds. A deleted pack drops out of its links.';

create table public.pack_share_redemptions (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.pack_shares(id) on delete cascade,
  -- The student who added the link, and the sender (so the sender can list them).
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The receiver's display name when they added it, shown to the sender.
  receiver_name text,
  packs_added integer not null default 0,
  created_at timestamptz not null default now(),
  unique (share_id, user_id)
);
create index pack_share_redemptions_owner_idx on public.pack_share_redemptions (owner_id, created_at desc);
comment on table public.pack_share_redemptions is 'Who added a share link and when. Written only by the share-packs function.';

-- A pack copied from a link: where it came from, and who shared it.
alter table public.study_sets
  add column shared_from uuid references public.pack_shares(id) on delete set null,
  add column shared_by_name text,
  add column shared_source_id uuid;
create index study_sets_shared_idx on public.study_sets (user_id, shared_from) where shared_from is not null;

-- ── Row level security ────────────────────────────────────────────
alter table public.pack_shares enable row level security;
alter table public.pack_share_items enable row level security;
alter table public.pack_share_redemptions enable row level security;

create policy "pack_shares: read own" on public.pack_shares
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "pack_shares: create own" on public.pack_shares
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pack_shares: delete own" on public.pack_shares
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "pack_share_items: read own" on public.pack_share_items
  for select to authenticated using ((select auth.uid()) = user_id);
-- Only your own packs, in your own links.
create policy "pack_share_items: add own pack to own link" on public.pack_share_items
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.study_sets s where s.id = study_set_id and s.user_id = (select auth.uid()))
    and exists (select 1 from public.pack_shares p where p.id = share_id and p.user_id = (select auth.uid()))
  );

-- Senders see who added their links; receivers see their own additions.
-- No insert policy: only the share-packs function (service role) records these.
create policy "pack_share_redemptions: sender or receiver" on public.pack_share_redemptions
  for select to authenticated using ((select auth.uid()) in (owner_id, user_id));

-- Two-step verification, like every other user table.
create policy "pack_shares: two-step verification" on public.pack_shares
  as restrictive for all to authenticated
  using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()));
create policy "pack_share_items: two-step verification" on public.pack_share_items
  as restrictive for all to authenticated
  using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()));
create policy "pack_share_redemptions: two-step verification" on public.pack_share_redemptions
  as restrictive for all to authenticated
  using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()));

-- New tables get no Data API grants automatically (since 2026-10-30).
grant select, insert, delete on public.pack_shares to authenticated;
grant select, insert on public.pack_share_items to authenticated;
grant select on public.pack_share_redemptions to authenticated;
grant select, insert, update, delete on public.pack_shares, public.pack_share_items, public.pack_share_redemptions to service_role;
revoke all on public.pack_shares, public.pack_share_items, public.pack_share_redemptions from anon;
