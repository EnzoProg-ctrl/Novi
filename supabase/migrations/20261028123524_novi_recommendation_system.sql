-- Hybrid recommendation system, part 1: storage.
--
--   1. Knowledge tracing. topic_mastery.mastery_score becomes a Bayesian
--      Knowledge Tracing estimate (probability the student knows the topic),
--      updated in the database on every answer instead of an accuracy ratio
--      written by the app. Existing history is replayed through the model.
--   2. Topic embeddings, cached on topics, for semantic retrieval.
--   3. Topic-focused practice sessions (study_sessions.focus_topic_id).
--   4. recommendations gains ranking, action and evidence columns.
--   5. recommendation_events records what students do with recommendations.
--   6. private.recommendation_metrics() for offline evaluation.

-- ── 1. Knowledge tracing ─────────────────────────────────────────────

alter table public.topic_mastery
  add column evidence numeric(7,2) not null default 0 check (evidence >= 0),
  add column kt_version text not null default 'bkt-1',
  add column last_incorrect_at timestamptz;

comment on column public.topic_mastery.mastery_score is
  'Estimated probability (0-1) that the student knows the topic: Bayesian Knowledge Tracing, see private.kt_params().';
comment on column public.topic_mastery.evidence is
  'Effective number of answers behind mastery_score. Repeats of the same question count for less, so it grows slower than attempts_total. strength (generated from mastery_score) says nothing about this: read both.';

/**
 * Every knowledge-tracing parameter, in one place. Bump `version` when they
 * change; rows keep the version they were computed with (kt_version).
 *
 *   prior     P(L0): chance a student already knows a topic they haven't tried
 *   transit   P(T): chance of learning it from one practice opportunity
 *   slip      P(S): a student who knows it still gets it wrong; rises with difficulty
 *   guess     P(G): a student who doesn't know it gets it right; by question type
 *             (self-graded types are set a little high, since self-marking is generous)
 *   forget_half_life_days  how fast an unpractised estimate drifts back toward the prior
 *   repeat_weights         how much the 1st, 2nd and later attempts at the same
 *                          question count; a remembered answer is weaker evidence
 *
 * Hand-set, not fitted: there is not yet enough history to fit them. They
 * are the textbook BKT defaults, adjusted for question type.
 */
create or replace function private.kt_params()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 'bkt-1',
    'prior', 0.30,
    'transit', 0.12,
    'slip_base', 0.10,
    'slip_per_level', 0.025,
    'slip_min', 0.03,
    'slip_max', 0.25,
    'forget_half_life_days', 30,
    'repeat_weights', jsonb_build_array(1.0, 0.6, 0.35),
    'guess', jsonb_build_object(
      'multiple_choice', 0.25,
      'true_false', 0.50,
      'fill_blank', 0.08,
      'short_answer', 0.15,
      'flashcard', 0.20
    )
  )
$$;

/** One BKT step: the posterior given the answer, then the chance of learning. */
create or replace function private.kt_step(
  p_known numeric, p_correct boolean, p_slip numeric, p_guess numeric, p_transit numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with posterior as (
    select coalesce(
      case when p_correct
        then (p_known * (1 - p_slip)) / nullif(p_known * (1 - p_slip) + (1 - p_known) * p_guess, 0)
        else (p_known * p_slip) / nullif(p_known * p_slip + (1 - p_known) * (1 - p_guess), 0)
      end,
      p_known
    ) as p
  )
  select least(1, greatest(0, p + (1 - p) * p_transit)) from posterior
$$;

/**
 * Folds one answer into the student's mastery of the question's topic.
 *
 * The topic comes from the question row, not from the attempt, so an attempt
 * with a missing or wrong topic_id still counts against the right topic, and
 * only questions belonging to the student count at all. Questions without a
 * topic leave mastery alone.
 */
create or replace function private.kt_apply_attempt(
  p_user uuid, p_question uuid, p_correct boolean, p_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg jsonb := private.kt_params();
  prior numeric := (cfg->>'prior')::numeric;
  q record;
  m record;
  earlier int;
  weight numeric;
  known numeric;
  days numeric;
  slip numeric;
  guess numeric;
  updated numeric;
  evidence numeric;
  review_days int;
begin
  select type, difficulty, topic_id into q
  from public.questions
  where id = p_question and user_id = p_user;
  if q.topic_id is null then
    return;
  end if;

  -- Earlier attempts at this very question: a repeat is weaker evidence.
  select count(*) into earlier
  from public.question_attempts
  where user_id = p_user and question_id = p_question and created_at < p_at;
  weight := (cfg->'repeat_weights'->>least(earlier, 2))::numeric;

  select * into m
  from public.topic_mastery
  where user_id = p_user and topic_id = q.topic_id
  for update;

  known := coalesce(m.mastery_score, prior);
  -- Forgetting: knowledge above the prior fades back toward it while unpractised.
  if m.last_practiced_at is not null and p_at > m.last_practiced_at and known > prior then
    days := extract(epoch from (p_at - m.last_practiced_at)) / 86400;
    known := prior + (known - prior) * power(0.5, days / (cfg->>'forget_half_life_days')::numeric);
  end if;

  slip := least((cfg->>'slip_max')::numeric, greatest((cfg->>'slip_min')::numeric,
    (cfg->>'slip_base')::numeric + (cfg->>'slip_per_level')::numeric * (coalesce(q.difficulty, 3) - 3)));
  guess := coalesce((cfg->'guess'->>q.type)::numeric, 0.20);

  updated := known + weight * (private.kt_step(known, p_correct, slip, guess, (cfg->>'transit')::numeric) - known);
  evidence := coalesce(m.evidence, 0) + weight;
  review_days := case when updated < 0.5 then 1 when updated < 0.7 then 3 when updated < 0.85 then 7 else 14 end;

  insert into public.topic_mastery as t (
    user_id, topic_id, mastery_score, attempts_total, attempts_correct, current_streak,
    last_practiced_at, next_review_at, review_interval_days, evidence, kt_version, last_incorrect_at
  ) values (
    p_user, q.topic_id, round(updated, 3),
    1, case when p_correct then 1 else 0 end, case when p_correct then 1 else 0 end,
    p_at, p_at + make_interval(days => review_days), review_days, evidence, cfg->>'version',
    case when p_correct then null else p_at end
  )
  on conflict (user_id, topic_id) do update set
    mastery_score = excluded.mastery_score,
    attempts_total = t.attempts_total + 1,
    attempts_correct = t.attempts_correct + excluded.attempts_correct,
    current_streak = case when p_correct then t.current_streak + 1 else 0 end,
    last_practiced_at = excluded.last_practiced_at,
    next_review_at = excluded.next_review_at,
    review_interval_days = excluded.review_interval_days,
    evidence = excluded.evidence,
    kt_version = excluded.kt_version,
    last_incorrect_at = coalesce(excluded.last_incorrect_at, t.last_incorrect_at);
end;
$$;

create or replace function private.kt_on_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.kt_apply_attempt(new.user_id, new.question_id, new.is_correct, new.created_at);
  return null;
end;
$$;

revoke all on function private.kt_params() from public, anon, authenticated;
revoke all on function private.kt_step(numeric, boolean, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function private.kt_apply_attempt(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function private.kt_on_attempt() from public, anon, authenticated;

create trigger question_attempts_knowledge_tracing
  after insert on public.question_attempts
  for each row execute function private.kt_on_attempt();

-- Replay existing history through the model, oldest first, so every row is
-- an estimate from the same model rather than the old accuracy ratio.
do $$
declare
  a record;
begin
  delete from public.topic_mastery;
  for a in
    select user_id, question_id, is_correct, created_at
    from public.question_attempts
    order by created_at, id
  loop
    perform private.kt_apply_attempt(a.user_id, a.question_id, a.is_correct, a.created_at);
  end loop;
end;
$$;

-- ── 2. Topic embeddings ──────────────────────────────────────────────

alter table public.topics
  add column embedding extensions.vector(1536),
  add column embedded_at timestamptz;

comment on column public.topics.embedding is
  'Embedding of the topic name and description (same model as material_chunks), made once by the recommend function and reused.';

-- ── 3. Topic-focused practice ────────────────────────────────────────

alter table public.study_sessions
  add column focus_topic_id uuid references public.topics(id) on delete set null;

comment on column public.study_sessions.focus_topic_id is
  'Set when the session practises one topic of the pack (opened from a recommendation); null for the whole pack.';

-- ── 4. Recommendations ───────────────────────────────────────────────

alter table public.recommendations
  add column score numeric(6,4),
  add column rank smallint,
  add column action jsonb not null default '{}'::jsonb,
  add column evidence jsonb not null default '{}'::jsonb,
  add column batch_id uuid,
  add column signature text,
  add column model_version text;

alter table public.recommendations drop constraint recommendations_kind_check;
alter table public.recommendations add constraint recommendations_kind_check check (kind = any (array[
  'review_topic', 'practice_more', 'revisit_material', 'new_material', 'take_break', 'keep_streak',
  'continue_session', 'start_pack'
]));

comment on column public.recommendations.evidence is
  'The stored facts the recommendation and its explanation were built from (counts, dates, mastery), for evaluation.';
comment on column public.recommendations.signature is
  'Fingerprint of the learning data the batch was computed from; a new answer, pack or plan makes it stale.';

create index recommendations_batch_idx on public.recommendations (user_id, batch_id);

-- ── 5. Recommendation events ─────────────────────────────────────────

create table public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  event text not null check (event in ('shown', 'opened', 'dismissed', 'started', 'completed')),
  session_id uuid references public.study_sessions(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- One of each per recommendation: a re-render or double click can't count twice.
  unique (recommendation_id, event)
);

comment on table public.recommendation_events is
  'What students did with a recommendation (shown, opened, dismissed, started, completed), linked to the practice session it led to.';

create index recommendation_events_user_idx on public.recommendation_events (user_id, created_at desc);

alter table public.recommendation_events enable row level security;

create policy "recommendation_events: own rows" on public.recommendation_events for select
  using ((select auth.uid()) = user_id);
create policy "recommendation_events: record own" on public.recommendation_events for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.recommendations r
      where r.id = recommendation_id and r.user_id = (select auth.uid())
    )
  );
create policy "recommendation_events: two-step verification" on public.recommendation_events
  as restrictive for all
  using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()));

revoke all on table public.recommendation_events from anon;
grant select, insert on table public.recommendation_events to authenticated;
grant all on table public.recommendation_events to service_role;

-- ── 6. Evaluation ────────────────────────────────────────────────────

/**
 * Baseline measures for the recommender over the last p_days, across all
 * students (service role / SQL editor only). Not click-through alone:
 *
 *   targets_gap_rate     share of topic recommendations made for a topic below 0.6
 *   open_rate            opened / shown
 *   completion_rate      completed / opened
 *   avg_mastery_change   mastery now minus mastery when recommended, for completed ones
 *   avg_session_accuracy accuracy of sessions started from a recommendation
 *   topics_covered       distinct topics recommended
 *   repeat_rate          share of recommendations that repeat one from the student's previous batch
 */
create or replace function private.recommendation_metrics(p_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with recs as (
    select r.*
    from public.recommendations r
    where r.created_at >= now() - make_interval(days => p_days) and r.batch_id is not null
  ),
  ev as (
    select recommendation_id,
           bool_or(event = 'shown') as shown,
           bool_or(event = 'opened') as opened,
           bool_or(event = 'completed') as completed,
           max((detail->>'accuracy')::numeric) filter (where event = 'completed') as accuracy
    from public.recommendation_events
    group by recommendation_id
  ),
  joined as (
    select recs.*, ev.shown, ev.opened, ev.completed, ev.accuracy, tm.mastery_score as mastery_now
    from recs
    left join ev on ev.recommendation_id = recs.id
    left join public.topic_mastery tm on tm.user_id = recs.user_id and tm.topic_id = recs.topic_id
  ),
  batches as (
    select user_id, batch_id, min(created_at) as at,
           array_agg(kind || ':' || coalesce(topic_id::text, '') || ':' || coalesce(study_set_id::text, '')) as keys
    from recs group by user_id, batch_id
  ),
  repeats as (
    select b.batch_id, b.keys,
           lag(b.keys) over (partition by b.user_id order by b.at) as prev_keys
    from batches b
  )
  select jsonb_build_object(
    'recommendations', (select count(*) from joined),
    'targets_gap_rate', (select round(avg(case when (evidence->>'mastery')::numeric < 0.6 then 1 else 0 end), 3)
                         from joined where topic_id is not null and evidence ? 'mastery'),
    'open_rate', (select round(count(*) filter (where opened)::numeric / nullif(count(*) filter (where shown), 0), 3) from joined),
    'completion_rate', (select round(count(*) filter (where completed)::numeric / nullif(count(*) filter (where opened), 0), 3) from joined),
    'avg_mastery_change', (select round(avg(mastery_now - (evidence->>'mastery')::numeric), 3)
                           from joined where completed and evidence ? 'mastery'),
    'avg_session_accuracy', (select round(avg(accuracy), 3) from joined where completed),
    'topics_covered', (select count(distinct topic_id) from joined),
    'repeat_rate', (select round(avg(
                      (select count(*) from unnest(keys) k where k = any(prev_keys))::numeric / nullif(cardinality(keys), 0)
                    ), 3) from repeats where prev_keys is not null)
  )
$$;

revoke all on function private.recommendation_metrics(int) from public, anon, authenticated;
