-- These are trigger functions only; nothing should be able to call them over the REST API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at()  from public, anon, authenticated;
