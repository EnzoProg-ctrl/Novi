-- Novi: user preferences for the Settings page.
--
-- Stored on profiles (one row per student, created at signup, already guarded
-- by own-row RLS) rather than a new table. The weekly goal is deliberately not
-- here: it already lives on learning_profile.weekly_session_goal, which the
-- Calendar and Progress pages read, and a second copy would drift.

alter table public.profiles
  add column default_session_minutes smallint not null default 60
    check (default_session_minutes in (25, 30, 45, 60, 90, 120)),
  add column default_break_minutes smallint not null default 10
    check (default_break_minutes in (5, 10, 15, 20)),
  -- 1 = Monday, 0 = Sunday (JavaScript's getDay numbering).
  add column week_starts_on smallint not null default 1
    check (week_starts_on in (0, 1)),
  add column notify_session_reminders boolean not null default true,
  add column notify_weekly_goal boolean not null default true,
  add column theme text not null default 'light'
    check (theme in ('light', 'dark', 'system')),
  add column accent_color text not null default 'coral'
    check (accent_color in ('coral', 'lavender', 'blue', 'mint', 'rose')),
  add column font_scale text not null default 'medium'
    check (font_scale in ('small', 'medium', 'large'));

comment on column public.profiles.default_session_minutes is
  'Default length of a new planned session, in minutes.';
comment on column public.profiles.default_break_minutes is
  'Default length of a new planned session of type break, in minutes.';
comment on column public.profiles.week_starts_on is
  'First day of the week for calendars, weekly goals and weekly reports: 1 Monday, 0 Sunday.';
comment on column public.profiles.notify_session_reminders is
  'Show an in-app reminder shortly before a planned session starts.';
comment on column public.profiles.notify_weekly_goal is
  'Show an in-app message when the weekly goal is reached.';
