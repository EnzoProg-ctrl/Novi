-- Explicit Data API grants.
--
-- From 2026-10-30 Supabase stops granting API access to new tables in public
-- automatically. Tables that already exist keep their grants, but replaying these
-- migrations (supabase db reset, a preview branch, a new project) creates every
-- table fresh, so without this file supabase-js would get "permission denied"
-- even though the RLS policies are correct.
--
-- Grants decide whether a role may touch a table at all; RLS still decides which
-- rows. anon gets nothing: a signed-out visitor never reads Novi's data.

-- The app, signed in. Every one of these tables is fenced to the owner by RLS.
grant select, insert, update, delete on table
  public.profiles,
  public.buddies,
  public.subjects,
  public.topics,
  public.materials,
  public.material_chunks,
  public.study_sets,
  public.summaries,
  public.key_concepts,
  public.questions,
  public.study_sessions,
  public.question_attempts,
  public.chat_messages,
  public.topic_mastery,
  public.learning_profile,
  public.learning_insights,
  public.recommendations,
  public.daily_activity
to authenticated;

-- The process-material Edge Function. service_role bypasses RLS but still needs
-- table grants. ai_model_health is deliberately absent from the list above: it is
-- server-only circuit-breaker state.
grant select, insert, update, delete on table
  public.profiles,
  public.buddies,
  public.subjects,
  public.topics,
  public.materials,
  public.material_chunks,
  public.study_sets,
  public.summaries,
  public.key_concepts,
  public.questions,
  public.study_sessions,
  public.question_attempts,
  public.chat_messages,
  public.topic_mastery,
  public.learning_profile,
  public.learning_insights,
  public.recommendations,
  public.daily_activity,
  public.ai_model_health
to service_role;
