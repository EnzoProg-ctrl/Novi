-- School details shown in Settings -> Profile. education_level already exists.
-- Both are optional free text, trimmed by the app; the limits stop abuse.
alter table public.profiles
  add column school text check (school is null or char_length(school) between 1 and 120),
  add column course text check (course is null or char_length(course) between 1 and 80);
