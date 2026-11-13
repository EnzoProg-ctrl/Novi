-- Hybrid recommendation system, part 2: semantic retrieval by topic.
--
-- For each topic, the materials whose passages are closest to the topic's
-- cached embedding (topics.embedding). Runs as the caller, so RLS limits it
-- to the student's own topics and material. The nearest 24 passages per topic
-- come from the HNSW index; each material keeps its best passage.

create or replace function public.match_topic_material(
  p_topic_ids uuid[],
  p_per_topic integer default 3,
  p_threshold double precision default 0.5
)
returns table (topic_id uuid, material_id uuid, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select t.id, best.material_id, best.similarity
  from public.topics t
  cross join lateral (
    select near.material_id, max(near.similarity) as similarity
    from (
      select c.material_id,
             1 - (c.embedding operator(extensions.<=>) t.embedding) as similarity
      from public.material_chunks c
      where c.embedding is not null
      order by c.embedding operator(extensions.<=>) t.embedding
      limit 24
    ) near
    group by near.material_id
    order by max(near.similarity) desc
    limit least(greatest(p_per_topic, 1), 10)
  ) best
  where t.id = any(p_topic_ids[1:20])
    and t.embedding is not null
    and best.similarity >= p_threshold
$$;

revoke all on function public.match_topic_material(uuid[], integer, double precision) from public, anon;
grant execute on function public.match_topic_material(uuid[], integer, double precision) to authenticated, service_role;
