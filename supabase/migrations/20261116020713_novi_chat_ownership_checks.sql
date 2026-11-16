-- AI Chat privacy hardening. Row level security already keeps each student to
-- their own rows for reading. These restrictive policies also stop a student
-- from writing a row that points at someone else's data: a message filed
-- under another student's conversation, or a conversation or message linked
-- to another student's study pack. Foreign keys are checked without row
-- level security, so without these such a link would be accepted.

create policy "chat_messages: own conversation and pack (insert)"
  on public.chat_messages as restrictive for insert to authenticated
  with check (
    (conversation_id is null or exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())))
    and (study_set_id is null or exists (
      select 1 from public.study_sets s
      where s.id = study_set_id and s.user_id = (select auth.uid())))
  );

create policy "chat_messages: own conversation and pack (update)"
  on public.chat_messages as restrictive for update to authenticated
  using (true)
  with check (
    (conversation_id is null or exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())))
    and (study_set_id is null or exists (
      select 1 from public.study_sets s
      where s.id = study_set_id and s.user_id = (select auth.uid())))
  );

create policy "chat_conversations: own pack (insert)"
  on public.chat_conversations as restrictive for insert to authenticated
  with check (study_set_id is null or exists (
    select 1 from public.study_sets s
    where s.id = study_set_id and s.user_id = (select auth.uid())));

create policy "chat_conversations: own pack (update)"
  on public.chat_conversations as restrictive for update to authenticated
  using (true)
  with check (study_set_id is null or exists (
    select 1 from public.study_sets s
    where s.id = study_set_id and s.user_id = (select auth.uid())));
