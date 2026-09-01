-- Add authorized-signature image field to company_profile (logo_url already existed)
-- and set defaults to the branding assets shipped under public/branding/.

ALTER TABLE "public"."company_profile"
  ADD COLUMN IF NOT EXISTS "signature_url" "text";

UPDATE "public"."company_profile"
  SET
    "logo_url" = COALESCE("logo_url", '/branding/logo.png'),
    "signature_url" = COALESCE("signature_url", '/branding/signature.png');
