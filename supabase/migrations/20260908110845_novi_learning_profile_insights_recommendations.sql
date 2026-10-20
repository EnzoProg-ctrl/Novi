-- Novi: the adaptation layer — what Novi learns about the student and does with it

-- ---------------------------------------------------------------
-- learning_profile: rolling aggregates, one row per student
-- ---------------------------------------------------------------
create table public.learning_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_explanation_style text check (preferred_explanation_style in
    ('real_world_examples','step_by_step','analogies','visual','concise','socratic')),
  difficulty_preference smallint not null default 3 check (difficulty_preference between 1 and 5),
  pace text check (pace in ('slow','steady','fast')),
  avg_session_minutes numeric(6,2) check (avg_session_minutes >= 0),
  best_study_hour smallint check (best_study_hour between 0 and 23),
  overall_accuracy numeric(4,3) check (overall_accuracy between 0 and 1),
  total_study_minutes integer not null default 0 check (total_study_minutes >= 0),
  current_day_streak integer not null default 0 check (current_day_streak >= 0),
  longest_day_streak integer not null default 0 check (longest_day_streak >= 0),
  traits jsonb not null default '{}'::jsonb,
  last_computed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger learning_profile_set_updated_at before update on public.learning_profile
  for each row execute function public.set_updated_at();

comment on table public.learning_profile is
  'Aggregate picture of how this student studies. Recomputed by the Python learning engine.';

-- ---------------------------------------------------------------
-- learning_insights: discrete things Novi has learned, with evidence
--   e.g. "You understand concepts better with real-world examples."
-- ---------------------------------------------------------------
create table public.learning_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  insight_type text not null check (insight_type in
    ('explanation_style','struggling_topic','strong_topic','study_habit','pacing','misconception')),
  statement text not null,
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  is_active boolean not null default true,
  shown_to_student boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_insights_active_idx on public.learning_insights (user_id, insight_type)
  where is_active;
create trigger learning_insights_set_updated_at before update on public.learning_insights
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- recommendations: "here's what to study next"
-- ---------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  study_set_id uuid references public.study_sets(id) on delete cascade,
  kind text not null check (kind in
    ('review_topic','practice_more','revisit_material','new_material','take_break','keep_streak')),
  title text not null,
  rationale text,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'pending' check (status in
    ('pending','accepted','dismissed','completed','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recommendations_pending_idx on public.recommendations (user_id, priority desc, created_at desc)
  where status = 'pending';
create trigger recommendations_set_updated_at before update on public.recommendations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- daily_activity: study-habit rollup, powers streaks and "best hour"
-- ---------------------------------------------------------------
create table public.daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  minutes_studied integer not null default 0 check (minutes_studied >= 0),
  sessions_count integer not null default 0 check (sessions_count >= 0),
  questions_answered integer not null default 0 check (questions_answered >= 0),
  questions_correct integer not null default 0 check (questions_correct >= 0),
  materials_added integer not null default 0 check (materials_added >= 0),
  primary key (user_id, activity_date),
  constraint daily_activity_correct_lte_answered check (questions_correct <= questions_answered)
);
create index daily_activity_recent_idx on public.daily_activity (user_id, activity_date desc);

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.learning_profile   enable row level security;
alter table public.learning_insights  enable row level security;
alter table public.recommendations    enable row level security;
alter table public.daily_activity     enable row level security;

create policy "learning_profile: own row" on public.learning_profile for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "learning_insights: own rows" on public.learning_insights for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recommendations: own rows" on public.recommendations for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "daily_activity: own rows" on public.daily_activity for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Extend the signup trigger so a profile AND a learning profile are created together
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.learning_profile (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
