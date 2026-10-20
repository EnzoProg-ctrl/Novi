-- Novi: private file storage for uploads + semantic retrieval helper

-- ---------------------------------------------------------------
-- Private bucket. Path convention: <user_id>/<material_id>/<filename>
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-materials',
  'study-materials',
  false,
  52428800, -- 50 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A student may only touch files under their own user-id folder
create policy "study-materials: read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "study-materials: upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "study-materials: update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "study-materials: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------
-- Semantic search over the student's own material.
-- security invoker => RLS still applies, a student can only match their own chunks.
-- ---------------------------------------------------------------
create or replace function public.match_material_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 8,
  filter_material_id uuid default null,
  filter_subject_id uuid default null,
  similarity_threshold double precision default 0.0
)
returns table (
  id uuid,
  material_id uuid,
  content text,
  page_number integer,
  section_title text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.material_id,
    c.content,
    c.page_number,
    c.section_title,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.material_chunks c
  join public.materials m on m.id = c.material_id
  where c.embedding is not null
    and (filter_material_id is null or c.material_id = filter_material_id)
    and (filter_subject_id is null or m.subject_id = filter_subject_id)
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= similarity_threshold
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

comment on function public.match_material_chunks is
  'Cosine-similarity retrieval over the calling student''s material chunks. Grounds the buddy''s answers.';
