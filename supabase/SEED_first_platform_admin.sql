-- Not a migration — a one-off you run yourself in Supabase Studio's SQL
-- editor after phase_a29_platform_admin.sql has been applied, and after you
-- have (or create) a normal elf_accounts login via the existing /login flow.
--
-- Grants platform_admin to the elf_accounts row matching your email.
-- Adjust the email if you want a different/new account to be the first
-- platform admin.

INSERT INTO platform_admins (account_id, role)
SELECT id, 'platform_admin'
FROM elf_accounts
WHERE email = 'clyde.elitefundraising@gmail.com'
ON CONFLICT (account_id) DO NOTHING;

-- Verify:
--   SELECT pa.id, pa.role, ea.email, ea.name
--   FROM platform_admins pa JOIN elf_accounts ea ON ea.id = pa.account_id;
