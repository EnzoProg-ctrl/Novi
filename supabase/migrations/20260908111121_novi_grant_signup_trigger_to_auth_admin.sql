-- Postgres checks EXECUTE on a trigger function at CREATE TRIGGER time, not at fire time,
-- but grant it explicitly so signup can never break on a privilege technicality.
-- supabase_auth_admin is not an API-exposed role, so this does not re-expose the RPC.
grant execute on function public.handle_new_user() to supabase_auth_admin;
