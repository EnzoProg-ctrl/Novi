-- Novi: study material intake — subjects, topics, uploaded materials, embedded chunks

-- ---------------------------------------------------------------
-- subjects: student-defined buckets (e.g. "Data Structures")
-- ---------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null default '#FF6B5A',
  icon text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subjects_user_idx on public.subjects (user_id) where not archived;
create unique index subjects_user_name_key on public.subjects (user_id, lower(btrim(name)));
create trigger subjects_set_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- topics: the unit the learning engine tracks mastery against
-- ---------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  created_at timestamptz not null default now()
);
create index topics_user_subject_idx on public.topics (user_id, subject_id);
create unique index topics_user_subject_name_key
  on public.topics (user_id, subject_id, lower(btrim(name))) nulls not distinct;

comment on table public.topics is 'Normalized concepts extracted from material; mastery is tracked per topic.';

-- ---------------------------------------------------------------
-- materials: an uploaded PDF / PPTX / DOCX / image / pasted note
-- ---------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  source_type text not null check (source_type in
    ('pdf','pptx','docx','image','text','link')),
  storage_path text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes >= 0),
  page_count integer check (page_count >= 0),
  extracted_text text,
  word_count integer check (word_count >= 0),
  status text not null default 'uploaded' check (status in
    ('uploaded','extracting','embedding','generating','ready','failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- pasted notes carry their text inline; everything else needs a stored file
  constraint materials_storage_path_required
    check (source_type = 'text' or storage_path is not null)
);
create index materials_user_created_idx on public.materials (user_id, created_at desc);
create index materials_subject_idx on public.materials (subject_id);
create index materials_status_idx on public.materials (status) where status <> 'ready';
create unique index materials_storage_path_key on public.materials (storage_path)
  where storage_path is not null;
create trigger materials_set_updated_at before update on public.materials
  for each row execute function public.set_updated_at();

comment on column public.materials.storage_path is
  'Path inside the private study-materials bucket. Convention: <user_id>/<material_id>/<filename>';

-- ---------------------------------------------------------------
-- material_chunks: retrieval units with embeddings (grounds the buddy)
-- ---------------------------------------------------------------
create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer check (token_count >= 0),
  page_number integer check (page_number >= 0),
  section_title text,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (material_id, chunk_index)
);
create index material_chunks_material_idx on public.material_chunks (material_id, chunk_index);
create index material_chunks_embedding_idx
  on public.material_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

comment on column public.material_chunks.embedding is
  '1536-dim embedding (OpenAI text-embedding-3-small). Change dimension here if you swap models.';

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.subjects        enable row level security;
alter table public.topics          enable row level security;
alter table public.materials       enable row level security;
alter table public.material_chunks enable row level security;

create policy "subjects: own rows" on public.subjects for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "topics: own rows" on public.topics for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "materials: own rows" on public.materials for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "material_chunks: own rows" on public.material_chunks for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
