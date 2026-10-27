-- Stage F1 — read-only diagnosis of athletes, grades, coaches, parents and
-- parent links on the test team (elf-season-test-2026). One SELECT; changes
-- nothing. Accounts appear only as labels (acct-1, acct-2, ...), never as
-- ids, emails or names; no passwords, hashes, salts, tokens or join codes.
-- Athlete names are the synthetic test names. Decisions come from the same
-- functions the Complete Season preview uses.
WITH
s AS (SELECT 'elf-season-test-2026'::text AS slug),
ath AS (
  SELECT a.id, a.name, a.class_year, p.next_class, p.outcome, p.flag_reason, a.created_at
  FROM public.athletes a, s
  JOIN LATERAL public.team_season_athlete_plan(s.slug) p ON true
  WHERE a.campaign_slug = s.slug AND p.athlete_id = a.id
),
acct_ids AS (
  SELECT account_id, min(at) AS first_seen FROM (
    SELECT c.account_id, c.created_at AS at FROM public.team_coaches c, s WHERE c.campaign_slug = s.slug
    UNION ALL SELECT m.account_id, m.created_at FROM public.team_members m, s WHERE m.campaign_slug = s.slug
    UNION ALL SELECT r.account_id, r.created_at FROM public.parent_access_requests r, s WHERE r.campaign_slug = s.slug
  ) x WHERE account_id IS NOT NULL GROUP BY account_id
),
acct AS (
  SELECT i.account_id, 'acct-' || row_number() OVER (ORDER BY i.first_seen, i.account_id) AS label,
         EXISTS (SELECT 1 FROM public.elf_accounts e WHERE e.id = i.account_id) AS exists_
  FROM acct_ids i
),
lbl AS (SELECT account_id, label || CASE WHEN exists_ THEN '' ELSE ' (NO elf_accounts ROW)' END AS l FROM acct),
plan AS (SELECT * FROM s, LATERAL public.team_season_member_plan(s.slug)),
rows AS (
  -- 1. Athletes and stored grades. Brackets show the exact stored text.
  SELECT 1 AS sec, a.name AS k,
         'class_year=' || coalesce('[' || a.class_year || ']', 'NULL') || ' len=' || coalesce(length(a.class_year)::text, '-')
         || ' -> next=' || coalesce(a.next_class, 'NULL') || ' outcome=' || a.outcome
         || coalesce(' flag=' || a.flag_reason, '') AS v
  FROM ath a
  UNION ALL
  -- 2. Coaches.
  SELECT 2, 'coach ' || c.role,
         'account=' || coalesce(l.l, 'NONE') || ' created=' || to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
         || ' also_member_on_team=' || EXISTS (SELECT 1 FROM public.team_members m WHERE m.campaign_slug = s.slug AND m.account_id = c.account_id)::text
  FROM public.team_coaches c CROSS JOIN s LEFT JOIN lbl l ON l.account_id = c.account_id
  WHERE c.campaign_slug = s.slug
  UNION ALL
  -- 3. Staff invitations.
  SELECT 3, 'invitation role=' || i.role,
         'accepted=' || (i.accepted_at IS NOT NULL)::text || ' revoked=' || (i.revoked_at IS NOT NULL)::text
         || ' expired=' || (i.expires_at <= now())::text
  FROM public.team_staff_invitations i, s WHERE i.campaign_slug = s.slug
  UNION ALL
  -- 4. Members (team_members), with the preview's decision.
  SELECT 4, 'member role=' || m.role,
         'account=' || coalesce(l.l, 'NONE')
         || ' legacy_athlete=' || coalesce((SELECT a.name || ' (' || coalesce(a.class_year, 'NULL') || ')' FROM ath a WHERE a.id = m.athlete_id), CASE WHEN m.athlete_id IS NULL THEN 'none' ELSE 'NOT ON THIS TEAM' END)
         || ' links=[' || coalesce((SELECT string_agg(coalesce(a.name, 'athlete not on team'), ', ' ORDER BY a.name)
                                     FROM public.team_member_athletes t LEFT JOIN ath a ON a.id = t.athlete_id
                                    WHERE t.team_member_id = m.id), '') || ']'
         || ' decision=' || coalesce(p.decision, '?') || ' returning_children=' || coalesce(p.returning_children::text, '?')
  FROM public.team_members m CROSS JOIN s
  LEFT JOIN lbl l ON l.account_id = m.account_id
  LEFT JOIN plan p ON p.member_id = m.id
  WHERE m.campaign_slug = s.slug
  UNION ALL
  -- 5. Parent access requests and what each approval produced.
  SELECT 5, 'parent request status=' || r.status,
         'account=' || coalesce(l.l, 'NONE')
         || ' athlete=' || coalesce((SELECT a.name || ' (' || coalesce(a.class_year, 'NULL') || ')' FROM ath a WHERE a.id = r.athlete_id), 'NOT ON THIS TEAM')
         || ' decided=' || (r.decided_at IS NOT NULL)::text
         || ' resulting_member=' || CASE WHEN r.resulting_member_id IS NULL THEN 'none'
              ELSE coalesce((SELECT 'role ' || m.role || CASE WHEN m.account_id = r.account_id THEN ' same account' ELSE ' DIFFERENT account' END
                               FROM public.team_members m WHERE m.id = r.resulting_member_id), 'MISSING ROW') END
         || ' link_exists=' || EXISTS (
              SELECT 1 FROM public.team_member_athletes t WHERE t.team_member_id = r.resulting_member_id AND t.athlete_id = r.athlete_id)::text
         || ' account_has_member_row=' || EXISTS (SELECT 1 FROM public.team_members m WHERE m.campaign_slug = s.slug AND m.account_id = r.account_id)::text
         || ' account_is_coach=' || EXISTS (SELECT 1 FROM public.team_coaches c WHERE c.campaign_slug = s.slug AND c.account_id = r.account_id)::text
  FROM public.parent_access_requests r CROSS JOIN s LEFT JOIN lbl l ON l.account_id = r.account_id
  WHERE r.campaign_slug = s.slug
  UNION ALL
  -- 6. Totals, as the preview counts them.
  SELECT 6, 'totals',
         'athletes=' || (SELECT count(*) FROM ath)
         || ' members=' || (SELECT count(*) FROM plan)
         || ' parent_rows=' || (SELECT count(*) FROM plan WHERE role = 'parent')
         || ' links=' || (SELECT count(*) FROM public.team_member_athletes t JOIN public.team_members m ON m.id = t.team_member_id, s WHERE m.campaign_slug = s.slug)
         || ' parents_carried=' || (SELECT count(*) FROM plan WHERE role = 'parent' AND decision = 'carry')
         || ' pending_parent_requests=' || (SELECT count(*) FROM public.parent_access_requests r, s WHERE r.campaign_slug = s.slug AND r.status = 'pending')
)
SELECT sec, k AS item, v AS detail FROM rows ORDER BY sec, k, v;
