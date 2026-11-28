-- Length limits on text the browser can write directly.
--
-- Row level security already keeps every row to its owner, but nothing stopped
-- a student from storing an arbitrarily large value in their own rows by
-- calling the API directly. These checks bound each free-text column. Every
-- limit sits well above what the app itself allows (and above all existing
-- data, checked on 2026-11-28), so nothing the app does is affected:
--   chat messages: 4,000 typed (MAX_MESSAGE_CHARS), longer AI replies
--   extracted text: process-material keeps at most 60,000 characters
--   display name: 60 in Settings (NAME_MAX)

alter table public.chat_messages
  add constraint chat_messages_content_length check (char_length(content) <= 20000),
  add constraint chat_messages_metadata_size check (metadata is null or pg_column_size(metadata) <= 65536);

alter table public.profiles
  add constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 80),
  add constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  add constraint profiles_timezone_length check (timezone is null or char_length(timezone) <= 64);

alter table public.question_attempts
  add constraint question_attempts_given_answer_length check (given_answer is null or char_length(given_answer) <= 4000);

alter table public.buddies
  add constraint buddies_greeting_length check (greeting is null or char_length(greeting) <= 500);

alter table public.study_sets
  add constraint study_sets_title_length check (char_length(title) <= 200),
  add constraint study_sets_shared_by_name_length check (shared_by_name is null or char_length(shared_by_name) <= 80),
  add constraint study_sets_error_message_length check (error_message is null or char_length(error_message) <= 1000),
  add constraint study_sets_generation_model_length check (generation_model is null or char_length(generation_model) <= 100),
  add constraint study_sets_generation_params_size check (generation_params is null or pg_column_size(generation_params) <= 8192);

alter table public.materials
  add constraint materials_extracted_text_length check (extracted_text is null or char_length(extracted_text) <= 100000),
  add constraint materials_error_message_length check (error_message is null or char_length(error_message) <= 1000),
  add constraint materials_storage_path_length check (storage_path is null or char_length(storage_path) <= 1024),
  add constraint materials_mime_type_length check (mime_type is null or char_length(mime_type) <= 255);

alter table public.recommendation_events
  add constraint recommendation_events_detail_size check (detail is null or pg_column_size(detail) <= 8192);

alter table public.learning_profile
  add constraint learning_profile_traits_size check (traits is null or pg_column_size(traits) <= 16384);

alter table public.subjects
  add constraint subjects_color_length check (color is null or char_length(color) <= 32),
  add constraint subjects_icon_length check (icon is null or char_length(icon) <= 64);
