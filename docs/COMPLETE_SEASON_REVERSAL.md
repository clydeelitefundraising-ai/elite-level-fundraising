# Complete Season — reversing an accidental completion

Status: **readiness analysis and proposed procedure only.** Nothing here is
implemented or has been run against any database. Completion cannot be undone
from the app, and this document does not change that.

Source of truth: `public.team_season_complete` in
`supabase/migrations/phase_s1_complete_season.sql`, the read-only guard in
`phase_s2_completed_season_read_only.sql`, and the entry point in
`phase_s4_season_complete_access.sql`.

## 1. What one completion writes (one transaction)

`OLD` is the completed season's slug and `NEW` is the successor's slug. All of
these writes happen under the transaction-local flag
`elf.season_transition = 'on'`, which is what lets them pass the read-only
guard.

| # | Table | Effect | Can it be undone? |
|---|-------|--------|-------------------|
| 1 | `campaign_settings` | **INSERT** of the `NEW` row. Branding and settings are copied; `fundraising_enabled = false`; `crm_contact_id` is NULL; `predecessor_campaign_slug = OLD`; `season_started_at = now`. | Delete it, after all the child rows below. |
| 2 | `team_coaches` | **INSERT** a copy of every account-linked coach (head, assistant, booster) with a placeholder password. | Delete the rows where `campaign_slug = NEW`. |
| 3 | `athletes` | **INSERT** returning athletes with advanced grades and `goal_cents` NULL, linked by `previous_season_athlete_id`. Graduates aren't copied. | Delete the rows for `NEW`. Old athletes are untouched. |
| 4 | `team_members` | **INSERT** carried members with new salts, mapped by `account_id`. | Delete the rows for `NEW`. |
| 5 | `team_member_athletes` | **INSERT** parent links to the copied athletes. | Delete the links of `NEW` members. |
| 6 | `user_blocks` | **INSERT** translated copies of the blocks between carried people. | Delete the rows for `NEW`. |
| 7 | `calendar_events` | **INSERT** copies of the events dated on or after today. The originals stay. | Delete the rows for `NEW`. |
| 8 | `fund_uses`, `team_products`, `fundraising_contact_goals` (team goal only) | **INSERT** copies. | Delete the rows for `NEW`. |
| 10 | `campaign_settings` (`OLD`) | **UPDATE** `archived = true`, `season_completed_at = now`, `successor_campaign_slug = NEW`. | Set them back to `false`, NULL, NULL. This needs the guard flag. `archived` was `false` before completion, because archived teams are refused with `season_team_archived`. |
| 11 | `team_join_codes` | **UPDATE** `OLD`'s code to `revoked = true` (the table holds one code per team), then **INSERT** a new code for `NEW`. | Delete `NEW`'s code. Un-revoke `OLD`'s code only if it was active before completion. The table keeps no revoke timestamp, so record its state first or issue a fresh code. |
| 12a | `calendar_subscription_tokens` | **UPDATE**: every unrevoked feed link moves `OLD → NEW`. The feed URL stays the same. | Move the rows with `campaign_slug = NEW` back to `OLD`. Links created after completion are indistinguishable. |
| 12b | `push_subscriptions` | **UPDATE**: carried people's rows move to `NEW` and are remapped to their `NEW` member or coach ids. | Move them back and remap through `account_id` to the `OLD` member or coach ids. |
| 13 | `account_team_order` | **UPDATE**: `NEW` is inserted just before `OLD` for every carried account. | Remove `NEW` from `team_slugs` (`array_remove`). |
| 15 | `team_season_transitions` | **INSERT** one audit row: the idempotency key, the request hash, the full result **including the new join code**, and the actor. | **Never.** Its trigger refuses DELETE, TRUNCATE and any UPDATE, even by the owner and even with the flag on. |

The transition sends no email, SMS, push or Stripe calls. Its only effects
outside the database are what readers see: the calendar feed shows `NEW`'s
events, and apps open `NEW`.

## 2. What changes after completion (each hour makes reversal harder)

Once `NEW` is active, people use it:

- members and coaches joining with the new code;
- attendance, messages, announcements, tasks and events created in `NEW`;
- a platform admin turning on `NEW`'s fundraising;
- donations recorded against `NEW`.

None of these are copies of `OLD` data, so reversal must either **move them to
`OLD`** or **lose them**. A donation must never be lost or deleted. If `NEW`
has any donations, stop. Reversal needs a supervised data migration instead.

Late Stripe webhooks for `OLD` still land on `OLD`, because `donations` isn't
guarded. They need no action.

## 3. Structural blockers (why this must be a reviewed migration, not ad-hoc SQL)

1. **The season can never be completed again.** The audit row stays forever
   and `team_season_transitions` has `UNIQUE (from_campaign_slug)` and
   `UNIQUE (to_campaign_slug)`. A later completion of `OLD`, or to the same
   `NEW` slug, fails when it inserts its audit row, and the transaction rolls
   back. Re-completing after a reversal needs a schema change, for example a
   reversal ledger plus partial unique indexes that ignore reversed rows.
2. **The old receipt can still be replayed.** `team_season_replay` returns the
   stored result for the idempotency key. Once `OLD` is no longer completed,
   the 5B wrapper has no successor to check. So any currently authorized Head
   Coach or admin of `OLD` with the old confirmation id would get a receipt
   pointing at a deleted `NEW`. A reversal must also make the wrapper refuse
   keys whose transition was reversed, for example via the ledger.
3. **The guard bypass is a session flag.** Undoing items 10–11 on `OLD`
   requires `set_config('elf.season_transition', 'on', true)` in a direct
   database session as the owner. The app's service role can't run raw SQL,
   so this is possible only from the Supabase SQL editor or `psql`. Such a
   session can write anything on a completed season, so it must be short,
   reviewed and recorded.
4. **The audit row keeps the new join code.** Section 5B strips it from every
   API response. The row itself is readable by `service_role` (SELECT only),
   so treat that code as exposed to anyone holding the service key, and never
   reactivate it.

## 4. Proposed admin-only recovery procedure (not implemented)

Preconditions: a platform admin and the project owner both agree, the request
is in writing, the procedure is rehearsed first on a disposable local
database seeded from the same migrations, and it is then run on hosted QA
before production is ever considered.

1. **Freeze.** Take `NEW` offline for writes. Pause the cron jobs that touch
   it. Make sure `NEW`'s fundraising is off.
2. **Inventory, read-only.** Use the audit row for `OLD → NEW` to get the
   transition id, completion time and summary. Count every row in `NEW`
   created after `completed_at`. Stop if any donation references `NEW`.
3. **Back up.** Export a point-in-time snapshot covering every `OLD` and `NEW`
   row in the tables above.
4. **Ship a reviewed migration in a single transaction**, not ad-hoc SQL:
   - (a) Add a `team_season_reversals` ledger (immutable, one row per
     transition id, with actor, reason and time).
   - (b) Update the 5B wrapper to refuse replays of reversed transitions.
   - (c) Under `elf.season_transition = 'on'`:
     - move post-completion `NEW` content to `OLD` where it maps cleanly
       (through `account_id` or `previous_season_athlete_id`), or keep it in an
       archived `NEW` if it doesn't;
     - reverse items 12b, 12a, 13 and 11;
     - delete items 8, 7, 6, 5, 4, 3 and 2, then item 1, in that order;
     - restore item 10;
     - insert the ledger row.
   - (d) Verify, in the same transaction, that `OLD` is no longer completed,
     `NEW` no longer exists, the row counts match the inventory, and the
     donations are unchanged. Otherwise roll back.
5. **Re-issue access.** Generate a fresh join code for `OLD`; don't reuse the
   old one. Tell the affected coaches.
6. **Record it.** Keep the ledger row, the backup and the review notes.

Until such a migration exists, the supported response to an accidental
completion is **forward-fixing within `NEW`**: correct the roster, invite
anyone who was missed, keep fundraising off, and use the archived `OLD` as
history. Completion shows a preview, needs two typed confirmations and the
execute flag, and (after 5B) needs Stripe confirmation. All of these exist to
make that rare.
