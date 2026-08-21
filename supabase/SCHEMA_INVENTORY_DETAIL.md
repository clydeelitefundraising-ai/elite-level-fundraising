# Schema Inventory Detail — 21 tables missing from migration history

**Superseded 2026-08-21 by the real `pg_dump` at `supabase/baseline/schema.sql`** — kept for the record. That file now has authoritative DDL (indexes, FKs, unique/check constraints, RLS state) for every table below; this document only has best-effort column/type/FK data from PostgREST introspection.

Generated 2026-08-21 via PostgREST OpenAPI introspection (`GET {SUPABASE_URL}/rest/v1/`) against the live production schema, using the service-role key already present in the local dev `.env.local` (no new credential was pulled from Vercel/Supabase for this).

**This is a best-effort column/type/FK inventory, NOT verified DDL.** It is missing: indexes, CHECK constraints, unique constraints (beyond primary key), triggers, functions, RLS policies/grants, and true enum type definitions (an enum-constrained column just shows as `text` here). See `SCHEMA_BASELINE_STATUS.md` for why a full `pg_dump`-equivalent wasn't attempted in this session, and what's needed to get one.

#### `account_reset_tokens` — 6 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| account_id | uuid | NOT NULL FK->elf_accounts.id |
| token_hash | text | NOT NULL |
| expires_at | timestamp with time zone | NOT NULL |
| used_at | timestamp with time zone | nullable |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `announcements` — 14 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL FK->campaign_settings.campaign_slug |
| title | text | NOT NULL |
| body | text | NOT NULL DEFAULT "" |
| category | text | NOT NULL DEFAULT "team" |
| priority | text | NOT NULL DEFAULT "normal" |
| author_name | text | NOT NULL |
| author_role | text | NOT NULL |
| coach_id | uuid | NOT NULL FK->team_coaches.id |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| updated_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| attachment_id | uuid | nullable FK->team_files.id |
| recipient_scope | text | NOT NULL DEFAULT "everyone" |
| recipient_athlete_id | uuid | nullable |

#### `athlete_outreach_current` *(view, not a table)* — 8 columns
| column | type | constraints |
|---|---|---|
| id | uuid | nullable PK |
| athlete_id | uuid | nullable FK->athletes.id |
| campaign_slug | text | nullable |
| status | text | nullable |
| note | text | nullable |
| contacted_by | text | nullable |
| coach_id | uuid | nullable |
| created_at | timestamp with time zone | nullable |

#### `athletes` — 12 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| name | text | NOT NULL |
| event | text | nullable |
| created_at | timestamp with time zone | nullable DEFAULT "now()" |
| jersey_number | integer | nullable |
| grad_year | integer | nullable |
| profile_photo | text | nullable |
| goal_cents | integer | nullable |
| contact_phone | text | nullable |
| contact_email | text | nullable |
| class_year | text | nullable |

#### `calendar_events` — 12 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| title | text | NOT NULL |
| event_date | date | NOT NULL |
| event_time | text | NOT NULL DEFAULT "" |
| location | text | NOT NULL DEFAULT "" |
| type | text | NOT NULL DEFAULT "team" |
| coach_id | uuid | nullable |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| description | text | nullable |
| start_time | time without time zone | nullable |
| end_time | time without time zone | nullable |

#### `campaign_settings` — 34 columns
| column | type | constraints |
|---|---|---|
| campaign_slug | text | NOT NULL PK |
| school_name | text | NOT NULL DEFAULT "" |
| sport_name | text | NOT NULL DEFAULT "" |
| goal_cents | integer | NOT NULL DEFAULT 0 |
| deadline | text | NOT NULL DEFAULT "" |
| mascot | text | NOT NULL DEFAULT "Pumas" |
| primary_color | text | NOT NULL DEFAULT "#1B4FA8" |
| secondary_color | text | NOT NULL DEFAULT "#C4A35A" |
| location | text | NOT NULL DEFAULT "Paradise Valley, Arizona" |
| season | text | NOT NULL DEFAULT "2025 Season" |
| logo_url | text | NOT NULL DEFAULT "" |
| archived | boolean | nullable DEFAULT false |
| show_program_identity | boolean | nullable DEFAULT true |
| show_share_section | boolean | nullable DEFAULT true |
| show_fund_uses | boolean | nullable DEFAULT true |
| show_recent_donations | boolean | nullable DEFAULT true |
| show_sponsors | boolean | nullable DEFAULT true |
| show_leaderboard | boolean | nullable DEFAULT true |
| show_donation_card | boolean | nullable DEFAULT true |
| layout_variant | text | nullable DEFAULT "classic" |
| external_store_url | text | nullable |
| store_provider | text | nullable |
| default_athlete_goal_cents | integer | nullable |
| team_id | uuid | NOT NULL DEFAULT "gen_random_uuid()" |
| contact_requirement | text | nullable DEFAULT "phone_or_email" |
| status | text | nullable DEFAULT "live" |
| is_demo | boolean | NOT NULL DEFAULT false |
| demo_template | text | nullable |
| theme_primary_color | text | nullable |
| theme_secondary_color | text | nullable |
| theme_accent_color | text | nullable |
| theme_button_color | text | nullable |
| crm_contact_id | uuid | nullable FK->coach_crm_contacts.id |
| show_booster_in_staff_roster | boolean | NOT NULL DEFAULT true |

#### `donations` — 12 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| donor_name | text | nullable |
| amount | numeric | NOT NULL DEFAULT 0 |
| athlete | text | nullable |
| message | text | nullable |
| stripe_session_id | text | nullable |
| campaign_slug | text | nullable |
| created_at | timestamp with time zone | nullable DEFAULT "now()" |
| amount_cents | integer | nullable |
| athlete_name | text | nullable |
| donation_message | text | nullable |
| athlete_id | uuid | nullable FK->athletes.id |

#### `elf_accounts` — 7 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| email | text | NOT NULL |
| password_hash | text | NOT NULL |
| salt | text | NOT NULL |
| name | text | NOT NULL |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| profile_photo_url | text | nullable |

#### `fund_uses` — 7 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| title | text | NOT NULL |
| description | text | NOT NULL |
| icon | text | NOT NULL DEFAULT "💰" |
| sort_order | integer | NOT NULL DEFAULT 0 |
| created_at | timestamp with time zone | nullable DEFAULT "now()" |

#### `marketing_demo_requests` — 17 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| school_name | text | NOT NULL |
| sport_program | text | nullable |
| email | text | NOT NULL |
| role | text | NOT NULL |
| message | text | nullable |
| status | text | NOT NULL DEFAULT "new" |
| source | text | nullable |
| referral_source | text | nullable |
| program_size | text | nullable |
| internal_notes | text | nullable |
| ip | text | nullable |
| user_agent | text | nullable |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| updated_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `push_subscriptions` — 10 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| platform | text | NOT NULL DEFAULT "web" |
| endpoint | text | nullable |
| p256dh | text | nullable |
| auth_key | text | nullable |
| expo_token | text | nullable |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| member_id | uuid | nullable FK->team_members.id |
| coach_id | uuid | nullable FK->team_coaches.id |

#### `sponsors` — 15 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| name | text | NOT NULL |
| url | text | NOT NULL |
| tier | text | NOT NULL |
| created_at | timestamp with time zone | nullable DEFAULT "now()" |
| sponsorship_amount_cents | integer | nullable |
| logo_url | text | nullable |
| description | text | nullable |
| display_order | integer | NOT NULL DEFAULT 0 |
| visible | boolean | NOT NULL DEFAULT true |
| contact_name | text | nullable |
| contact_email | text | nullable |
| contact_phone | text | nullable |
| industry | text | nullable |

#### `team_coaches` — 9 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL FK->campaign_settings.campaign_slug |
| name | text | NOT NULL |
| email | text | NOT NULL |
| role | text | NOT NULL DEFAULT "head_coach" |
| password_hash | text | NOT NULL |
| salt | text | NOT NULL |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| account_id | uuid | nullable FK->elf_accounts.id |

#### `team_files` — 9 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| name | text | NOT NULL |
| storage_path | text | NOT NULL |
| file_type | text | NOT NULL |
| size_bytes | bigint | NOT NULL DEFAULT 0 |
| uploaded_by | text | NOT NULL |
| coach_id | uuid | NOT NULL |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `team_join_codes` — 6 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| code | text | NOT NULL |
| expires_at | timestamp with time zone | nullable |
| revoked | boolean | NOT NULL DEFAULT false |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `team_member_athletes` — 4 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| team_member_id | uuid | NOT NULL FK->team_members.id |
| athlete_id | uuid | NOT NULL FK->athletes.id |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `team_members` — 10 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| role | text | NOT NULL |
| name | text | NOT NULL |
| phone | text | nullable |
| email | text | nullable |
| athlete_id | uuid | nullable FK->athletes.id |
| salt | text | NOT NULL |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| account_id | uuid | nullable FK->elf_accounts.id |

#### `team_order_items` — 9 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| order_id | uuid | NOT NULL FK->team_orders.id |
| product_id | uuid | nullable FK->team_products.id |
| variant_id | uuid | nullable FK->team_product_variants.id |
| product_name | text | NOT NULL |
| variant_name | text | nullable |
| price_cents | integer | NOT NULL |
| quantity | integer | NOT NULL DEFAULT 1 |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `team_orders` — 9 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| stripe_session_id | text | NOT NULL |
| customer_name | text | nullable |
| customer_email | text | nullable |
| status | text | NOT NULL DEFAULT "paid" |
| total_cents | integer | NOT NULL |
| notes | text | nullable |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `team_product_variants` — 5 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| product_id | uuid | NOT NULL FK->team_products.id |
| name | text | NOT NULL |
| price_delta | integer | NOT NULL DEFAULT 0 |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |

#### `team_products` — 12 columns
| column | type | constraints |
|---|---|---|
| id | uuid | NOT NULL DEFAULT "gen_random_uuid()" PK |
| campaign_slug | text | NOT NULL |
| name | text | NOT NULL |
| description | text | nullable |
| category | text | NOT NULL DEFAULT "general" |
| price_cents | integer | NOT NULL |
| image_url | text | nullable |
| visible | boolean | NOT NULL DEFAULT true |
| display_order | integer | NOT NULL DEFAULT 0 |
| created_at | timestamp with time zone | NOT NULL DEFAULT "now()" |
| cost_cents | integer | nullable |
| external_url | text | nullable |
