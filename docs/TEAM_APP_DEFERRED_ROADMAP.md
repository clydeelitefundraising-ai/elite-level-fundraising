# ELF Team App Deferred Roadmap

## Security / Account Recovery
- Self-service password recovery for modern ELF accounts (elf_accounts) — COMPLETE (Phase A33)
  - PR #28 merged into main
  - phase_a33_password_reset_tokens.sql manually applied and verified in production Supabase
  - full production password-reset flow manually QA'd successfully on September 8, 2026 (request → email → reset link → new password → login)
  - /forgot-password, /reset-password/[token], password_reset_tokens table
  - session invalidation via salt rotation on reset (no elf_session/accountAuth changes required)
  - legacy /coach-login and team_coaches credentials intentionally untouched
- Password hashing modernization — OPEN, not started
  - migrate ELF account credentials from the current single-pass SHA-256 (salt + pepper) scheme to a password-hardening algorithm such as Argon2id
  - use a backward-compatible rehash-on-login or controlled migration strategy
  - separate from password recovery; do not bundle with future recovery-flow changes

## Production Checkpoint
- PR #27
- Production merge commit: 2a37610
- Team App UI Refresh + Identity Compatibility
- Production deployment verified Ready on September 8, 2026
- phase_a32_team_branding_customized.sql manually applied and verified in production Supabase
- campaign_settings.branding_customized = boolean, NOT NULL, DEFAULT false

## Product Features
### Team Branding Settings UI
- coach-accessible branding controls
- school/team logo
- primary color
- secondary color
- branding_customized integration
- Reset to ELF Branding
- automatic contrast protection
- active team controls active-team branding
- multi-team switching should immediately apply each team's theme

## Remaining UI Refresh
- Messages / Thread
- Notifications
- Shop
- Contacts
- Athlete Profile
- final auth/login visual refresh

## Known Behavioral Issues
- Requests badge-count discrepancy:
  sidebar/mobile badge = athlete requests only
  Home approvals card = combined athlete + comment approvals
- Settings Platform Admin gate inconsistency
- Fundraising has two independent leaderboard implementations

## Identity / Account Follow-Up
- legitimate live legacy-account activation QA
- modern multi-team linked-account QA
- coach with multiple sports
- parent with multiple children/teams
- athlete with multiple sports
- verify role-specific permissions remain scoped per active team

## Manual QA Still Required
- activate one legitimate legacy member into ELF account
- activate one legitimate legacy coach using admin-issued token
- verify modern /login after activation
- verify Profile access
- verify team selector
- verify Baseball ↔ Track switching for a multi-team coach
- verify URL slug changes
- verify logo/colors update per active team
- verify data does not leak between teams
- verify permissions change correctly by team role

## Technical Cleanup / Future Decisions
- decide whether Requests badge should represent all approvals or athlete joins only
- decide whether Platform Admin should access Settings
- consider consolidating Fundraising leaderboard implementations
- preserve Files inside Communications; do not recreate standalone Files section
- Team Branding remains separate from public campaign theme_* fields
