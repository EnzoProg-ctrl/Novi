-- Novi: extensions, shared helpers, identity (profiles + AI buddy)

create extension if not exists vector with schema extensions;

-- Shared updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- profiles: 1:1 extension of auth.users
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  education_level text check (education_level in
    ('junior_high','senior_high','college','graduate','self_learner','other')),
  timezone text not null default 'UTC',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Student profile, one row per auth user. Created automatically on signup.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- buddies: the student's named AI study companion (one per student)
-- ---------------------------------------------------------------
create table public.buddies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  personality text not null default 'supportive' check (personality in
    ('supportive','cheerful','calm','witty','focused')),
  mascot_variant text not null default 'default',
  accent_color text not null default '#FF6B5A',
  greeting text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.buddies is 'The student-named AI companion. One active buddy per student.';

create trigger buddies_set_updated_at
  before update on public.buddies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.buddies  enable row level security;

create policy "profiles: read own"   on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "buddies: read own"   on public.buddies for select using ((select auth.uid()) = user_id);
create policy "buddies: insert own" on public.buddies for insert with check ((select auth.uid()) = user_id);
create policy "buddies: update own" on public.buddies for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "buddies: delete own" on public.buddies for delete using ((select auth.uid()) = user_id);
