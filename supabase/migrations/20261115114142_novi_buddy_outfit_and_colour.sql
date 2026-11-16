-- "Edit your buddy" now chooses an outfit for the mascot and a colour for the
-- buddy's own spots (the circle behind the mascot, the chat avatar ring, the
-- Home buddy card). The colour is one of the app's named accents, like the
-- accent in Settings, instead of a free hex value.
update public.buddies set accent_color = 'coral' where accent_color is null or accent_color !~ '^(coral|lavender|blue|mint|rose)$';
alter table public.buddies alter column accent_color set default 'coral';
alter table public.buddies
  add constraint buddies_accent_color_check check (accent_color in ('coral', 'lavender', 'blue', 'mint', 'rose'));

update public.buddies set mascot_variant = 'default' where mascot_variant is null or mascot_variant not in ('default', 'smart_casual', 'formal', 'uniform');
alter table public.buddies
  add constraint buddies_mascot_variant_check check (mascot_variant in ('default', 'smart_casual', 'formal', 'uniform'));
