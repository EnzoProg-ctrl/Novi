-- Database tests for knowledge tracing and recommendation data isolation.
--
-- Runs inside one transaction and rolls back, so it leaves nothing behind.
-- Uses two synthetic students created here; no real student data is read.
-- Run in the Supabase SQL editor (or psql as postgres). A failed check raises
-- an exception naming it; success returns the measured values.

begin;

-- Two synthetic students.
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000000a1', 'kt-test-a@example.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000000b2', 'kt-test-b@example.invalid', 'authenticated', 'authenticated');

do $$
declare
  a uuid := '00000000-0000-4000-8000-0000000000a1';
  b uuid := '00000000-0000-4000-8000-0000000000b2';
  mat uuid; pack uuid; sess uuid;
  t_cell uuid; t_gen uuid; t_repeat uuid; t_tf uuid; t_blank uuid; t_forget_now uuid; t_forget_late uuid;
  q uuid;
  i int;
  p numeric; e numeric;
  t0 timestamptz := now() - interval '90 days';
begin
  insert into public.materials (user_id, title, source_type, status) values (a, 'KT test', 'text', 'ready') returning id into mat;
  insert into public.study_sets (user_id, material_id, title, status) values (a, mat, 'KT test pack', 'ready') returning id into pack;
  insert into public.study_sessions (user_id, study_set_id, mode) values (a, pack, 'practice') returning id into sess;
  insert into public.topics (user_id, name) values (a, 'Cell division') returning id into t_cell;
  insert into public.topics (user_id, name) values (a, 'Genetics') returning id into t_gen;
  insert into public.topics (user_id, name) values (a, 'Repeats') returning id into t_repeat;
  insert into public.topics (user_id, name) values (a, 'True or false') returning id into t_tf;
  insert into public.topics (user_id, name) values (a, 'Blanks') returning id into t_blank;
  insert into public.topics (user_id, name) values (a, 'Forget now') returning id into t_forget_now;
  insert into public.topics (user_id, name) values (a, 'Forget late') returning id into t_forget_late;

  -- 1. New student: nothing recorded yet.
  if exists (select 1 from public.topic_mastery where user_id = a) then
    raise exception 'new student should have no mastery rows';
  end if;

  -- 2. Repeated mistakes on one topic (three different questions, all wrong).
  for i in 1..3 loop
    insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
    values (pack, a, t_cell, 'multiple_choice', 'Cell ' || i, '["a","b","c","d"]', 'a', 3, i) returning id into q;
    insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
    values (a, sess, q, t_cell, false, t0 + make_interval(mins => i));
  end loop;
  select mastery_score into p from public.topic_mastery where user_id = a and topic_id = t_cell;
  if p is null or p >= 0.2 then raise exception 'repeated mistakes should leave mastery below 0.2, got %', p; end if;

  -- 3. Strong topic: four different questions, all right.
  for i in 1..4 loop
    insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
    values (pack, a, t_gen, 'multiple_choice', 'Gen ' || i, '["a","b","c","d"]', 'a', 3, 10 + i) returning id into q;
    insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
    values (a, sess, q, t_gen, true, t0 + make_interval(mins => 10 + i));
  end loop;
  select mastery_score into p from public.topic_mastery where user_id = a and topic_id = t_gen;
  if p < 0.9 then raise exception 'four right answers should give mastery above 0.9, got %', p; end if;

  -- 4. Not overclaiming: one right answer is far from mastered.
  insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
  values (pack, a, t_repeat, 'multiple_choice', 'Repeat', '["a","b","c","d"]', 'a', 3, 30) returning id into q;
  insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
  values (a, sess, q, t_repeat, true, t0 + interval '1 hour');
  select mastery_score into p from public.topic_mastery where user_id = a and topic_id = t_repeat;
  if p > 0.7 then raise exception 'one right answer should not exceed 0.7, got %', p; end if;

  -- 5. Repeats of the same question count for less than new questions.
  for i in 1..2 loop
    insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
    values (a, sess, q, t_repeat, true, t0 + interval '1 hour' + make_interval(mins => i));
  end loop;
  select evidence into e from public.topic_mastery where user_id = a and topic_id = t_repeat;
  if e <> 1.95 then raise exception 'three attempts at one question should be 1.95 evidence, got %', e; end if;

  -- 6. A right true/false answer (easy to guess) is weaker evidence than a right blank.
  insert into public.questions (study_set_id, user_id, topic_id, type, prompt, correct_answer, difficulty, position)
  values (pack, a, t_tf, 'true_false', 'TF', 'true', 3, 40) returning id into q;
  insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
  values (a, sess, q, t_tf, true, t0 + interval '2 hours');
  insert into public.questions (study_set_id, user_id, topic_id, type, prompt, correct_answer, difficulty, position)
  values (pack, a, t_blank, 'fill_blank', 'Blank', 'word', 3, 41) returning id into q;
  insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
  values (a, sess, q, t_blank, true, t0 + interval '2 hours');
  if (select mastery_score from public.topic_mastery where user_id = a and topic_id = t_tf)
     >= (select mastery_score from public.topic_mastery where user_id = a and topic_id = t_blank) then
    raise exception 'a right true/false answer should count for less than a right fill-in-the-blank';
  end if;

  -- 7. Inconsistent metadata: the attempt claims no topic, the question has one.
  insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
  values (pack, a, t_gen, 'multiple_choice', 'Gen untagged attempt', '["a","b","c","d"]', 'a', 3, 50) returning id into q;
  select attempts_total into i from public.topic_mastery where user_id = a and topic_id = t_gen;
  insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
  values (a, sess, q, null, true, t0 + interval '3 hours');
  if (select attempts_total from public.topic_mastery where user_id = a and topic_id = t_gen) <> i + 1 then
    raise exception 'an attempt without topic_id should still count for its question''s topic';
  end if;

  -- 8. A question with no topic changes no mastery.
  insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
  values (pack, a, null, 'multiple_choice', 'No topic', '["a","b","c","d"]', 'a', 3, 60) returning id into q;
  select count(*) into i from public.topic_mastery where user_id = a;
  insert into public.question_attempts (user_id, session_id, question_id, is_correct, created_at)
  values (a, sess, q, true, t0 + interval '4 hours');
  if (select count(*) from public.topic_mastery where user_id = a) <> i then
    raise exception 'a question without a topic should not create mastery';
  end if;

  -- 9. Forgetting: the same right answers, spread 60 days apart, end lower.
  for i in 1..2 loop
    insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
    values (pack, a, t_forget_now, 'multiple_choice', 'Now ' || i, '["a","b","c","d"]', 'a', 3, 70 + i) returning id into q;
    insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
    values (a, sess, q, t_forget_now, true, t0 + make_interval(mins => i));
    insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
    values (pack, a, t_forget_late, 'multiple_choice', 'Late ' || i, '["a","b","c","d"]', 'a', 3, 80 + i) returning id into q;
    insert into public.question_attempts (user_id, session_id, question_id, topic_id, is_correct, created_at)
    values (a, sess, q, t_forget_late, true, t0 + make_interval(days => 60 * (i - 1)));
  end loop;
  if (select mastery_score from public.topic_mastery where user_id = a and topic_id = t_forget_late)
     >= (select mastery_score from public.topic_mastery where user_id = a and topic_id = t_forget_now) then
    raise exception 'two months without practice should lower the estimate';
  end if;

  -- 10. Another student's question doesn't move this student's mastery.
  insert into public.materials (user_id, title, source_type, status) values (b, 'B', 'text', 'ready') returning id into mat;
  insert into public.study_sets (user_id, material_id, title, status) values (b, mat, 'B pack', 'ready') returning id into pack;
  insert into public.questions (study_set_id, user_id, topic_id, type, prompt, choices, correct_answer, difficulty, position)
  values (pack, b, null, 'multiple_choice', 'B q', '["a","b","c","d"]', 'a', 3, 1) returning id into q;
  select count(*) into i from public.topic_mastery where user_id = a;
  insert into public.question_attempts (user_id, question_id, topic_id, is_correct) values (a, q, t_cell, true);
  if (select count(*) from public.topic_mastery where user_id = a) <> i
     or (select attempts_total from public.topic_mastery where user_id = a and topic_id = t_cell) <> 3 then
    raise exception 'an attempt at another student''s question must not count';
  end if;

  -- A recommendation for each student, for the access checks below.
  insert into public.recommendations (user_id, kind, title, topic_id) values (a, 'practice_more', 'A rec', t_cell);
  insert into public.recommendations (user_id, kind, title) values (b, 'start_pack', 'B rec');
end;
$$;

-- ── As student A, through the Data API's role and RLS ───────────────
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated", "aal": "aal1"}';

do $$
declare
  other_rec uuid;
begin
  -- 11. Another student's mastery and recommendations are invisible.
  if exists (select 1 from public.topic_mastery where user_id <> (select auth.uid())) then
    raise exception 'student A can see someone else''s mastery';
  end if;
  if (select count(*) from public.recommendations) <> 1 then
    raise exception 'student A should see exactly their own recommendation';
  end if;

  -- 12. Another student's recommendation can't even be looked up (and 12b
  --     below shows an event can't be forged against it with a known id).
  select id into other_rec from public.recommendations where title = 'B rec';
  if other_rec is not null then
    raise exception 'student A can read student B''s recommendation';
  end if;

  -- 13. Knowledge tracing can't be called directly.
  begin
    perform private.kt_apply_attempt((select auth.uid()), gen_random_uuid(), true, now());
    raise exception 'student A could call kt_apply_attempt';
  exception when insufficient_privilege then null;
  end;

  -- 14. Recording own events works, and twice is still once.
  insert into public.recommendation_events (recommendation_id, event)
  select id, 'shown' from public.recommendations limit 1;
  insert into public.recommendation_events (recommendation_id, event)
  select id, 'shown' from public.recommendations limit 1
  on conflict (recommendation_id, event) do nothing;
  if (select count(*) from public.recommendation_events) <> 1 then
    raise exception 'a duplicate shown event was recorded';
  end if;
end;
$$;

-- 12b. A forged event for B's recommendation (id known) is refused by RLS.
reset role;
create temp table _b_rec on commit drop as
  select id from public.recommendations where title = 'B rec';
grant select on _b_rec to authenticated;
set local role authenticated;
do $$
begin
  insert into public.recommendation_events (recommendation_id, event) select id, 'opened' from _b_rec;
  raise exception 'student A recorded an event on student B''s recommendation';
exception when insufficient_privilege then null;
end;
$$;

reset role;
select json_build_object(
  'mastery', (select json_object_agg(t.name, json_build_object('p', m.mastery_score, 'evidence', m.evidence, 'strength', m.strength))
              from public.topic_mastery m join public.topics t on t.id = m.topic_id
              where m.user_id = '00000000-0000-4000-8000-0000000000a1'),
  'result', 'all checks passed'
) as recommendation_db_test;

rollback;
