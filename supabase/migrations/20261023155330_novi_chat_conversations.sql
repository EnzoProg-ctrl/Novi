-- Novi: AI Chat conversations.
--
-- chat_messages already existed, but its session_id points at study_sessions
-- (a practice sitting), not at a chat. A chat needs its own record so it can
-- have a title, appear in Recent Chats and be reopened later.

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- Optional study pack the student chose as context for this chat.
  study_set_id uuid references public.study_sets(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_conversations_user_recent_idx on public.chat_conversations (user_id, last_message_at desc);
create index chat_conversations_set_idx on public.chat_conversations (study_set_id);

create trigger chat_conversations_set_updated_at before update on public.chat_conversations
  for each row execute function public.set_updated_at();

comment on table public.chat_conversations is
  'One AI Chat conversation. Messages live in chat_messages (conversation_id).';

alter table public.chat_conversations enable row level security;

create policy "chat_conversations: own rows" on public.chat_conversations for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- New tables no longer get Data API access automatically (Supabase, 2026-10-30).
grant select, insert, update, delete on table public.chat_conversations to authenticated;
grant select, insert, update, delete on table public.chat_conversations to service_role;

-- Messages belong to a conversation; deleting the conversation deletes them.
alter table public.chat_messages
  add column conversation_id uuid references public.chat_conversations(id) on delete cascade;

create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);

comment on column public.chat_messages.conversation_id is
  'The AI Chat conversation this message belongs to.';
