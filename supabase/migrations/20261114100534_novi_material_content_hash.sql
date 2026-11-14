-- A SHA-256 of the uploaded file's bytes, computed in the browser, so an
-- upload of a file the student already has can be caught before it is
-- uploaded and processed again. Null for materials uploaded before this.
alter table public.materials
  add column content_hash text
  constraint materials_content_hash_format check (content_hash ~ '^[0-9a-f]{64}$');

create index materials_user_content_hash_idx
  on public.materials (user_id, content_hash)
  where content_hash is not null;
