# Auth email templates

Supabase Auth sends these emails, not the app. The hosted project doesn't read
this folder, so after changing a template, paste it into the dashboard:

**Supabase dashboard → Authentication → Emails → Templates**

| Template in the dashboard | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your Novi account |
| Change email address | `change-email.html` | Confirm your new email for Novi |
| Reset password | `reset-password.html` | Reset your Novi password |

For each one: open the template, set the subject, replace the whole message
body with the file's contents, and save. Send yourself a test (sign up with a
spare address) to check it.

Variables used (filled in by Supabase): `{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .NewEmail }}` (change email only), `{{ .SiteURL }}`, and
`{{ .Data.display_name }}` (the name given at sign-up, from user metadata).

Notes:
- Emails are inline-styled tables, since most mail apps ignore `<style>` blocks
  and modern layout. Keep it that way when editing.
- The button uses `#d8402e` (the app's darker coral), so white text stays
  readable. The logo is drawn with table cells, not an image, so it shows even
  when images are blocked.
- `{{ .SiteURL }}` is the Site URL in Authentication → URL Configuration. Set it
  to the live site before launch, or the links point to localhost.
