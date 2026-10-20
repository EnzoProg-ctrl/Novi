-- Circuit breaker state for the AI provider.
--
-- Edge Functions are stateless, so a rate limit hit in one invocation has to be
-- recorded somewhere the next invocation can see. Server-only: RLS is enabled
-- with no policies at all, so the anon and authenticated roles can never read
-- or write it; only the service role (which bypasses RLS) touches this table.
create table public.ai_model_health (
  model text primary key,
  cooling_until timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_status integer,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.ai_model_health is
  'Per-model cooldown so a 429/503 downgrades to a fallback model until it resets.';
comment on column public.ai_model_health.cooling_until is
  'Skip this model until this time. Null or past means available.';

alter table public.ai_model_health enable row level security;

create trigger ai_model_health_set_updated_at
  before update on public.ai_model_health
  for each row execute function public.set_updated_at();