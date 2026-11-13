-- Novi: planned study sessions (the Calendar) and a configurable weekly goal.
--
-- Kept separate from study_sessions on purpose. That table records sittings
-- that actually happened, and an open row there means "in progress": it feeds
-- Continue Where You Left Off, study time and the streak. A plan for Thursday
-- is a different thing and must not show up in any of those.

create table public.scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set_id uuid references public.study_sets(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  session_type text not null default 'focus' check (session_type in
    ('focus','practice','revision','break')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  -- Null until the student marks it done. Being in the past is not the same
  -- as having happened, so nothing sets this automatically.
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_sessions_time_order check (ends_at > starts_at),
  constraint scheduled_sessions_max_length check (ends_at - starts_at <= interval '12 hours')
);

create index scheduled_sessions_user_starts_idx on public.scheduled_sessions (user_id, starts_at);
create index scheduled_sessions_set_idx on public.scheduled_sessions (study_set_id);

create trigger scheduled_sessions_set_updated_at before update on public.scheduled_sessions
  for each row execute function public.set_updated_at();

comment on table public.scheduled_sessions is
  'Study sessions the student has planned on the Calendar. Separate from study_sessions, which records sittings that happened.';

alter table public.scheduled_sessions enable row level security;

create policy "scheduled_sessions: own rows" on public.scheduled_sessions for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- New tables no longer get Data API access automatically (Supabase, 2026-10-30).
grant select, insert, update, delete on table public.scheduled_sessions to authenticated;
grant select, insert, update, delete on table public.scheduled_sessions to service_role;

-- Weekly goal: completed planned sessions per week the student aims for.
alter table public.learning_profile
  add column weekly_session_goal smallint not null default 5
    check (weekly_session_goal between 1 and 21);

comment on column public.learning_profile.weekly_session_goal is
  'Planned sessions per week (Monday to Sunday) the student aims to complete. Shown on the Calendar.';
