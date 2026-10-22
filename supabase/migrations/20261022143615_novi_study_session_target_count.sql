-- How many questions the student chose to do in this sitting.
--
-- Stored on the session rather than held in the page so that resuming carries
-- on toward the same target instead of quietly switching to the whole pack.
-- Null means the whole pack, which is also what every earlier session meant.
alter table public.study_sessions
  add column target_count integer check (target_count >= 1);

comment on column public.study_sessions.target_count is
  'Questions the student chose to answer in this session; null means every question in the pack.';
