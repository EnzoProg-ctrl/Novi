-- Novi: aggregations for the Progress page.
--
-- Read-only, security invoker: RLS still applies, so a student only ever
-- aggregates their own rows. Aggregating here keeps responses small (a year of
-- answers would blow past PostgREST's row limit) and lets Postgres group by the
-- student's local calendar day, passed in as an IANA zone name.

-- Measured study time: time spent answering practice questions. Each answer is
-- capped at 5 minutes, the same cap finishSession applies, so a question left
-- on screen over lunch cannot inflate the total.
create or replace function public.progress_activity(p_start timestamptz, p_end timestamptz, p_tz text)
returns table (day date, study_set_id uuid, session_id uuid, seconds numeric, answers integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (a.created_at at time zone p_tz)::date as day,
    q.study_set_id,
    a.session_id,
    sum(least(coalesce(a.time_taken_ms, 0), 300000)) / 1000.0 as seconds,
    count(*)::integer as answers
  from public.question_attempts a
  join public.questions q on q.id = a.question_id
  where a.user_id = (select auth.uid())
    and a.created_at >= p_start
    and a.created_at < p_end
  group by 1, 2, 3
$$;

-- Study days, for streaks: any local day with an answered practice question or
-- a planned session the student marked completed.
create or replace function public.progress_active_days(p_since timestamptz, p_tz text)
returns setof date
language sql
stable
security invoker
set search_path = ''
as $$
  select (created_at at time zone p_tz)::date
  from public.question_attempts
  where user_id = (select auth.uid()) and created_at >= p_since
  union
  select (starts_at at time zone p_tz)::date
  from public.scheduled_sessions
  where user_id = (select auth.uid()) and completed_at is not null and starts_at >= p_since
  order by 1
$$;

-- Learning progress per pack: questions answered correctly at least once,
-- out of the pack's questions. Time spent plays no part in it.
create or replace function public.progress_pack_completion()
returns table (
  study_set_id uuid,
  title text,
  subject text,
  total_questions integer,
  correct_questions integer,
  last_practiced_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.title,
    sub.name,
    coalesce(q.total, 0)::integer,
    coalesce(a.correct, 0)::integer,
    a.last_at
  from public.study_sets s
  left join public.subjects sub on sub.id = s.subject_id
  left join (
    select study_set_id, count(*) as total
    from public.questions
    where user_id = (select auth.uid())
    group by study_set_id
  ) q on q.study_set_id = s.id
  left join (
    select qq.study_set_id,
           count(distinct qa.question_id) filter (where qa.is_correct) as correct,
           max(qa.created_at) as last_at
    from public.question_attempts qa
    join public.questions qq on qq.id = qa.question_id
    where qa.user_id = (select auth.uid())
    group by qq.study_set_id
  ) a on a.study_set_id = s.id
  where s.user_id = (select auth.uid())
$$;

revoke all on function public.progress_activity(timestamptz, timestamptz, text) from public, anon;
revoke all on function public.progress_active_days(timestamptz, text) from public, anon;
revoke all on function public.progress_pack_completion() from public, anon;
grant execute on function public.progress_activity(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.progress_active_days(timestamptz, text) to authenticated;
grant execute on function public.progress_pack_completion() to authenticated;
