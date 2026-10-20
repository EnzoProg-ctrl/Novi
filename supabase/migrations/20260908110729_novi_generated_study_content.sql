-- Novi: AI-generated study content — sets, summaries, key concepts, questions

-- ---------------------------------------------------------------
-- study_sets: one generation run over a material
-- ---------------------------------------------------------------
create table public.study_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid references public.materials(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  status text not null default 'generating' check (status in
    ('generating','ready','failed')),
  generation_model text,
  generation_params jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_sets_user_created_idx on public.study_sets (user_id, created_at desc);
create index study_sets_material_idx on public.study_sets (material_id);
create trigger study_sets_set_updated_at before update on public.study_sets
  for each row execute function public.set_updated_at();

comment on table public.study_sets is
  'A bundle of generated resources produced from one material. Regenerating creates a new set.';

-- ---------------------------------------------------------------
-- summaries: reviewers written at a chosen depth
-- ---------------------------------------------------------------
create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  study_set_id uuid not null references public.study_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'overview' check (kind in
    ('overview','detailed','reviewer','cheatsheet')),
  content text not null,
  reading_level text check (reading_level in ('simple','standard','advanced')),
  created_at timestamptz not null default now(),
  unique (study_set_id, kind)
);
create index summaries_user_idx on public.summaries (user_id);

-- ---------------------------------------------------------------
-- key_concepts: important terms and definitions
-- ---------------------------------------------------------------
create table public.key_concepts (
  id uuid primary key default gen_random_uuid(),
  study_set_id uuid not null references public.study_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  term text not null,
  definition text not null,
  example text,
  importance smallint not null default 3 check (importance between 1 and 5),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index key_concepts_set_idx on public.key_concepts (study_set_id, position);
create index key_concepts_topic_idx on public.key_concepts (topic_id);
create index key_concepts_user_idx on public.key_concepts (user_id);

-- ---------------------------------------------------------------
-- questions: practice items
-- ---------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  study_set_id uuid not null references public.study_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  source_chunk_id uuid references public.material_chunks(id) on delete set null,
  type text not null check (type in
    ('multiple_choice','true_false','short_answer','fill_blank','flashcard')),
  prompt text not null,
  choices jsonb,
  correct_answer text not null,
  explanation text,
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  bloom_level text check (bloom_level in
    ('remember','understand','apply','analyze','evaluate','create')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- multiple choice must ship its options
  constraint questions_choices_required
    check (type <> 'multiple_choice' or jsonb_typeof(choices) = 'array')
);
create index questions_set_idx on public.questions (study_set_id, position);
create index questions_topic_difficulty_idx on public.questions (topic_id, difficulty);
create index questions_user_idx on public.questions (user_id);

comment on column public.questions.choices is
  'JSON array of option strings for multiple_choice, e.g. ["A","B","C","D"].';

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.study_sets   enable row level security;
alter table public.summaries    enable row level security;
alter table public.key_concepts enable row level security;
alter table public.questions    enable row level security;

create policy "study_sets: own rows" on public.study_sets for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "summaries: own rows" on public.summaries for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "key_concepts: own rows" on public.key_concepts for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "questions: own rows" on public.questions for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
