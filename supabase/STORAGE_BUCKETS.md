# Supabase Storage buckets

None of these buckets are created by a tracked migration — they must be
provisioned manually in the Supabase Dashboard (Storage → New bucket) for
every environment (including any new pilot-school environment). All are
**public** buckets (read access via the `/storage/v1/object/public/...` URL
returned by the upload routes; writes go through app API routes using the
service-role key, never client-side).

| Bucket | Used by | Allowed MIME types | Notes |
|---|---|---|---|
| `sponsor-logos` | `api/team/[slug]/sponsors/logo`, `api/admin/sponsors/logo`, `api/admin/campaigns/[slug]/sponsors/logo` | `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml` | **Must include `image/png` and `image/webp`**, not just JPEG — the upload pipeline (`src/lib/logoUpload.ts`) preserves the original format (including PNG/WebP transparency) instead of forcing JPEG. A bucket configured with a JPEG-only MIME allowlist will reject PNG/WebP uploads with a `415 invalid_mime_type` storage error even though the app code is correct. Max upload size enforced app-side: 5MB. |
| `team-logos` | `api/admin/logo-upload` (school/org logo) | `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml` | Same format-preserving pipeline. Max 5MB. |
| `athlete-photos` | `api/team/[slug]/roster/photo` | image formats (forced to JPEG on upload) | Max 10MB. |
| `shop-images` | `api/team/[slug]/shop/products/image` | image formats (forced to JPEG on upload) | Max 10MB. |
| `profile-photos` | `api/account/profile/photo` | image formats incl. HEIC/HEIF (forced to JPEG on upload) | Max 5MB. |
| `team-files` | `api/team/[slug]/files/*` | PDF, PNG, JPEG, DOC/DOCX | Max 25MB. General file attachments, not resized. |

## New environment checklist

When standing up a new Supabase project (new pilot environment, staging, etc.):

1. Create each bucket above via Dashboard → Storage → New bucket, set **Public bucket** on.
2. Set the bucket's **Allowed MIME types** to match the table above — in particular, don't leave `sponsor-logos`/`team-logos` JPEG-only, since that silently breaks PNG/WebP logo uploads with a storage-level error that looks like an app bug.
3. No bucket-creation SQL exists in `supabase/migrations/` for any of these — buckets are dashboard/API-provisioned only, consistent with how `sponsors`, `athletes`, and `elf_accounts` (the tables, not the buckets) also predate migration tracking.
