


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_reset_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."account_reset_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "author_type" "text" NOT NULL,
    "author_coach_id" "uuid",
    "author_member_id" "uuid",
    "author_name" "text" NOT NULL,
    "author_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "decided_by_coach_id" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcement_comments_author_type_check" CHECK (("author_type" = ANY (ARRAY['coach'::"text", 'member'::"text"]))),
    CONSTRAINT "announcement_comments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."announcement_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'team'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "author_name" "text" NOT NULL,
    "author_role" "text" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachment_id" "uuid",
    "recipient_scope" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "recipient_athlete_id" "uuid",
    CONSTRAINT "announcements_category_check" CHECK (("category" = ANY (ARRAY['schedule'::"text", 'fundraiser'::"text", 'travel'::"text", 'meet-info'::"text", 'team-alert'::"text", 'team'::"text"]))),
    CONSTRAINT "announcements_priority_check" CHECK (("priority" = ANY (ARRAY['normal'::"text", 'high'::"text", 'pinned'::"text"]))),
    CONSTRAINT "announcements_recipient_scope_check" CHECK (("recipient_scope" = ANY (ARRAY['everyone'::"text", 'athletes'::"text", 'parents'::"text", 'boosters'::"text", 'athlete_specific'::"text"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_outreach" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "status" "text" NOT NULL,
    "note" "text",
    "contacted_by" "text",
    "coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "athlete_outreach_status_check" CHECK (("status" = ANY (ARRAY['contacted'::"text", 'needs_follow_up'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."athlete_outreach" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."athlete_outreach_current" AS
 SELECT DISTINCT ON ("athlete_id", "campaign_slug") "id",
    "athlete_id",
    "campaign_slug",
    "status",
    "note",
    "contacted_by",
    "coach_id",
    "created_at"
   FROM "public"."athlete_outreach"
  ORDER BY "athlete_id", "campaign_slug", "created_at" DESC;


ALTER VIEW "public"."athlete_outreach_current" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athletes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "event" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "jersey_number" integer,
    "grad_year" integer,
    "profile_photo" "text",
    "goal_cents" integer,
    "contact_phone" "text",
    "contact_email" "text",
    "class_year" "text"
);


ALTER TABLE "public"."athletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_identifier" "text",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "campaign_slug" "text",
    "summary" "text",
    "previous_value" "jsonb",
    "new_value" "jsonb",
    "ip_address" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_key" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "campaign_slug" "text",
    "coach_id" "uuid",
    "crm_contact_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "automation_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"]))),
    CONSTRAINT "automation_events_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."automation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_key" "text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "rules_evaluated" integer DEFAULT 0 NOT NULL,
    "events_created" integer DEFAULT 0 NOT NULL,
    "events_resolved" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "automation_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text"]))),
    CONSTRAINT "automation_runs_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual'::"text", 'scheduled'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."automation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "event_time" "text" DEFAULT ''::"text" NOT NULL,
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" DEFAULT 'team'::"text" NOT NULL,
    "coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "start_time" time without time zone,
    "end_time" time without time zone
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_subscription_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."calendar_subscription_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_settings" (
    "campaign_slug" "text" NOT NULL,
    "school_name" "text" DEFAULT ''::"text" NOT NULL,
    "sport_name" "text" DEFAULT ''::"text" NOT NULL,
    "goal_cents" integer DEFAULT 0 NOT NULL,
    "deadline" "text" DEFAULT ''::"text" NOT NULL,
    "mascot" "text" DEFAULT 'Pumas'::"text" NOT NULL,
    "primary_color" "text" DEFAULT '#1B4FA8'::"text" NOT NULL,
    "secondary_color" "text" DEFAULT '#C4A35A'::"text" NOT NULL,
    "location" "text" DEFAULT 'Paradise Valley, Arizona'::"text" NOT NULL,
    "season" "text" DEFAULT '2025 Season'::"text" NOT NULL,
    "logo_url" "text" DEFAULT ''::"text" NOT NULL,
    "archived" boolean DEFAULT false,
    "show_program_identity" boolean DEFAULT true,
    "show_share_section" boolean DEFAULT true,
    "show_fund_uses" boolean DEFAULT true,
    "show_recent_donations" boolean DEFAULT true,
    "show_sponsors" boolean DEFAULT true,
    "show_leaderboard" boolean DEFAULT true,
    "show_donation_card" boolean DEFAULT true,
    "layout_variant" "text" DEFAULT 'classic'::"text",
    "external_store_url" "text",
    "store_provider" "text",
    "default_athlete_goal_cents" integer,
    "team_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_requirement" "text" DEFAULT 'phone_or_email'::"text",
    "status" "text" DEFAULT 'live'::"text",
    "is_demo" boolean DEFAULT false NOT NULL,
    "demo_template" "text",
    "theme_primary_color" "text",
    "theme_secondary_color" "text",
    "theme_accent_color" "text",
    "theme_button_color" "text",
    "crm_contact_id" "uuid",
    "show_booster_in_staff_roster" boolean DEFAULT true NOT NULL,
    CONSTRAINT "campaign_settings_contact_requirement_check" CHECK (("contact_requirement" = ANY (ARRAY['phone_only'::"text", 'email_only'::"text", 'phone_or_email'::"text", 'phone_and_email'::"text"]))),
    CONSTRAINT "campaign_settings_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'demo'::"text", 'live'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."campaign_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clearance_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "url" "text",
    "attachment_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by_account_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clearance_resources_has_destination" CHECK ((("url" IS NOT NULL) OR ("attachment_id" IS NOT NULL)))
);


ALTER TABLE "public"."clearance_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_crm_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid",
    "activity_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "activity_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coach_crm_activities_type_check" CHECK (("activity_type" = ANY (ARRAY['note'::"text", 'call'::"text", 'email'::"text", 'text'::"text", 'demo'::"text", 'proposal'::"text", 'follow_up'::"text", 'status_change'::"text"])))
);


ALTER TABLE "public"."coach_crm_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_crm_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "school_name" "text",
    "sport" "text",
    "city" "text",
    "state" "text" DEFAULT 'AZ'::"text",
    "status" "text" DEFAULT 'prospect'::"text" NOT NULL,
    "source" "text",
    "estimated_value" numeric,
    "expected_close_date" "date",
    "last_contacted_at" timestamp with time zone,
    "next_follow_up_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "demo_request_id" "uuid",
    CONSTRAINT "coach_crm_contacts_status_check" CHECK (("status" = ANY (ARRAY['prospect'::"text", 'contacted'::"text", 'demo_scheduled'::"text", 'proposal_sent'::"text", 'signed'::"text", 'active'::"text", 'returning'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."coach_crm_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_invite_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_invite_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."communication_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body_text" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."communication_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_name" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "athlete" "text",
    "message" "text",
    "stripe_session_id" "text",
    "campaign_slug" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "amount_cents" integer,
    "athlete_name" "text",
    "donation_message" "text",
    "athlete_id" "uuid"
);


ALTER TABLE "public"."donations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."elf_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "salt" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_photo_url" "text"
);


ALTER TABLE "public"."elf_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fund_uses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" DEFAULT '💰'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fund_uses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fundraising_contact_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "athlete_id" "uuid",
    "goal" integer DEFAULT 10 NOT NULL,
    "set_by_coach_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fundraising_contact_goals_goal_check" CHECK (("goal" > 0))
);


ALTER TABLE "public"."fundraising_contact_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fundraising_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "phone" "text",
    "email" "text",
    "first_name" "text",
    "last_name" "text",
    "relationship" "text",
    "relationship_other" "text",
    "notes" "text",
    "added_by_type" "text" NOT NULL,
    "added_by_member_id" "uuid",
    "added_by_coach_id" "uuid",
    "sms_opt_in" boolean,
    "email_opt_in" boolean,
    "blast_excluded" boolean DEFAULT false NOT NULL,
    "consent_ip" "text",
    "consent_at" timestamp with time zone,
    "consent_source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fc_contact_method_required" CHECK ((("phone" IS NOT NULL) OR ("email" IS NOT NULL))),
    CONSTRAINT "fundraising_contacts_added_by_type_check" CHECK (("added_by_type" = ANY (ARRAY['athlete'::"text", 'parent'::"text", 'coach'::"text"]))),
    CONSTRAINT "fundraising_contacts_email_check" CHECK ((("email" IS NULL) OR ("length"(TRIM(BOTH FROM "email")) <= 254))),
    CONSTRAINT "fundraising_contacts_first_name_check" CHECK ((("first_name" IS NULL) OR ("length"("first_name") <= 100))),
    CONSTRAINT "fundraising_contacts_last_name_check" CHECK ((("last_name" IS NULL) OR ("length"("last_name") <= 100))),
    CONSTRAINT "fundraising_contacts_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 500))),
    CONSTRAINT "fundraising_contacts_phone_check" CHECK ((("phone" IS NULL) OR ("length"(TRIM(BOTH FROM "phone")) <= 30))),
    CONSTRAINT "fundraising_contacts_relationship_check" CHECK ((("relationship" IS NULL) OR ("relationship" = ANY (ARRAY['Family'::"text", 'Friend'::"text", 'Coworker'::"text", 'Neighbor'::"text", 'Coach'::"text", 'Teacher'::"text", 'Business'::"text", 'Other'::"text"])))),
    CONSTRAINT "fundraising_contacts_relationship_other_check" CHECK ((("relationship_other" IS NULL) OR ("length"("relationship_other") <= 100)))
);


ALTER TABLE "public"."fundraising_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_demo_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "school_name" "text" NOT NULL,
    "sport_program" "text",
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "source" "text",
    "referral_source" "text",
    "program_size" "text",
    "internal_notes" "text",
    "ip" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."marketing_demo_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "actor_type" "text" NOT NULL,
    "coach_id" "uuid",
    "member_id" "uuid",
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "participant_key" "text" GENERATED ALWAYS AS ((("actor_type" || ':'::"text") || COALESCE(("coach_id")::"text", ("member_id")::"text"))) STORED,
    CONSTRAINT "message_reads_actor_check" CHECK (((("actor_type" = 'coach'::"text") AND ("coach_id" IS NOT NULL) AND ("member_id" IS NULL)) OR (("actor_type" = 'member'::"text") AND ("member_id" IS NOT NULL) AND ("coach_id" IS NULL)))),
    CONSTRAINT "message_reads_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['coach'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."message_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_thread_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "actor_type" "text" NOT NULL,
    "coach_id" "uuid",
    "member_id" "uuid",
    "is_auto_included" boolean DEFAULT false NOT NULL,
    "is_observer" boolean DEFAULT false NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "participant_key" "text" GENERATED ALWAYS AS ((("actor_type" || ':'::"text") || COALESCE(("coach_id")::"text", ("member_id")::"text"))) STORED,
    CONSTRAINT "message_thread_participants_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['coach'::"text", 'member'::"text"]))),
    CONSTRAINT "participants_actor_check" CHECK (((("actor_type" = 'coach'::"text") AND ("coach_id" IS NOT NULL) AND ("member_id" IS NULL)) OR (("actor_type" = 'member'::"text") AND ("member_id" IS NOT NULL) AND ("coach_id" IS NULL))))
);


ALTER TABLE "public"."message_thread_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "subject" "text",
    "created_by_type" "text" NOT NULL,
    "created_by_coach_id" "uuid",
    "created_by_member_id" "uuid",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_preview" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creator_name" "text" NOT NULL,
    "creator_role" "text" NOT NULL,
    CONSTRAINT "message_threads_created_by_type_check" CHECK (("created_by_type" = ANY (ARRAY['coach'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."message_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_type" "text" NOT NULL,
    "sender_coach_id" "uuid",
    "sender_member_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sender_name" "text" NOT NULL,
    "sender_role" "text" NOT NULL,
    CONSTRAINT "messages_body_check" CHECK ((("length"(TRIM(BOTH FROM "body")) > 0) AND ("length"("body") <= 3000))),
    CONSTRAINT "messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['coach'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_coach_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_coach_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "recipient_type" "text",
    "recipient_id" "uuid",
    "email" "text",
    "phone" "text",
    "title" "text",
    "body" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "scheduled_for" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_queue_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'push'::"text", 'sms'::"text", 'internal'::"text"]))),
    CONSTRAINT "notification_queue_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."notification_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dismissed" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "reference_id" "uuid",
    "reference_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_scope" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "recipient_athlete_id" "uuid",
    CONSTRAINT "notifications_recipient_scope_check" CHECK (("recipient_scope" = ANY (ARRAY['everyone'::"text", 'athletes'::"text", 'parents'::"text", 'boosters'::"text", 'athlete_specific'::"text"]))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['announcement'::"text", 'file_upload'::"text", 'calendar_event'::"text", 'fundraiser'::"text", 'message'::"text", 'request'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text" DEFAULT 'default'::"text" NOT NULL,
    "school_name" "text" DEFAULT ''::"text" NOT NULL,
    "nickname" "text" DEFAULT ''::"text" NOT NULL,
    "logo_url" "text" DEFAULT ''::"text" NOT NULL,
    "primary_color" "text" DEFAULT '#1B4FA8'::"text" NOT NULL,
    "secondary_color" "text" DEFAULT '#C4A35A'::"text" NOT NULL,
    "default_team_photo_url" "text" DEFAULT ''::"text" NOT NULL,
    "default_layout" "text" DEFAULT 'classic'::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT ''::"text" NOT NULL,
    "state" "text" DEFAULT ''::"text" NOT NULL,
    "zip" "text" DEFAULT ''::"text" NOT NULL,
    "website" "text" DEFAULT ''::"text" NOT NULL,
    "short_description" "text" DEFAULT ''::"text" NOT NULL,
    "athletic_director" "text" DEFAULT ''::"text" NOT NULL,
    "athletic_director_email" "text" DEFAULT ''::"text" NOT NULL,
    "athletic_director_phone" "text" DEFAULT ''::"text" NOT NULL,
    "default_show_leaderboard" boolean DEFAULT true NOT NULL,
    "default_show_program_identity" boolean DEFAULT true NOT NULL,
    "default_show_share_section" boolean DEFAULT true NOT NULL,
    "default_show_fund_uses" boolean DEFAULT true NOT NULL,
    "default_show_recent_donations" boolean DEFAULT true NOT NULL,
    "default_show_sponsors" boolean DEFAULT true NOT NULL,
    "default_show_donation_card" boolean DEFAULT true NOT NULL,
    "default_fundraising_goal_cents" integer DEFAULT 0 NOT NULL,
    "default_athlete_goal_cents" integer DEFAULT 0 NOT NULL,
    "default_contact_goal" integer DEFAULT 10 NOT NULL,
    "default_campaign_length_days" integer DEFAULT 30 NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_athlete_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "class_year" "text" NOT NULL,
    "event" "text",
    "matched_athlete_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "decided_by_account_id" "uuid",
    "decided_at" timestamp with time zone,
    "decline_reason" "text",
    "resulting_athlete_id" "uuid",
    "resulting_member_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pending_athlete_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."pending_athlete_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "device_token" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_devices_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."push_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_preferences" (
    "account_id" "uuid" NOT NULL,
    "team_updates" boolean DEFAULT true NOT NULL,
    "messages" boolean DEFAULT true NOT NULL,
    "calendar" boolean DEFAULT true NOT NULL,
    "requests" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "platform" "text" DEFAULT 'web'::"text" NOT NULL,
    "endpoint" "text",
    "p256dh" "text",
    "auth_key" "text",
    "expo_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "member_id" "uuid",
    "coach_id" "uuid"
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsor_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sponsor_activities_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['note'::"text", 'call'::"text", 'email'::"text", 'meeting'::"text", 'sponsorship'::"text", 'renewal'::"text", 'status_change'::"text"])))
);


ALTER TABLE "public"."sponsor_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsor_businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_name" "text" NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "website" "text",
    "industry" "text",
    "city" "text",
    "state" "text" DEFAULT 'AZ'::"text",
    "address" "text",
    "preferred_sports" "text"[] DEFAULT '{}'::"text"[],
    "preferred_sponsorship_level" "text",
    "estimated_annual_budget" numeric,
    "lifetime_value" numeric DEFAULT 0,
    "last_sponsored_at" timestamp with time zone,
    "next_renewal_at" timestamp with time zone,
    "status" "text" DEFAULT 'prospect'::"text" NOT NULL,
    "source" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sponsor_businesses_status_check" CHECK (("status" = ANY (ARRAY['prospect'::"text", 'contacted'::"text", 'active'::"text", 'recurring'::"text", 'paused'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."sponsor_businesses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsor_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "tier" "text" DEFAULT 'gold'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "amount_cents" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."sponsor_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsor_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "campaign_slug" "text",
    "sponsorship_amount" numeric,
    "sponsorship_level" "text",
    "sponsored_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sponsor_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "tier" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sponsorship_amount_cents" integer,
    "logo_url" "text",
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "visible" boolean DEFAULT true NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "industry" "text",
    CONSTRAINT "sponsors_tier_check" CHECK (("tier" = ANY (ARRAY['title'::"text", 'platinum'::"text", 'gold'::"text", 'silver'::"text", 'bronze'::"text", 'community_partner'::"text"])))
);


ALTER TABLE "public"."sponsors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'head_coach'::"text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "salt" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid",
    CONSTRAINT "team_coaches_role_check" CHECK (("role" = ANY (ARRAY['head_coach'::"text", 'assistant_coach'::"text", 'booster'::"text"])))
);


ALTER TABLE "public"."team_coaches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "uploaded_by" "text" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_files_file_type_check" CHECK (("file_type" = ANY (ARRAY['pdf'::"text", 'image'::"text", 'doc'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."team_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_join_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "code" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_join_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_member_athletes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_member_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_member_athletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "role" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "athlete_id" "uuid",
    "salt" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid",
    CONSTRAINT "team_members_role_check" CHECK (("role" = ANY (ARRAY['athlete'::"text", 'parent'::"text", 'booster'::"text"])))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "variant_id" "uuid",
    "product_name" "text" NOT NULL,
    "variant_name" "text",
    "price_cents" integer NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "stripe_session_id" "text" NOT NULL,
    "customer_name" "text",
    "customer_email" "text",
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "total_cents" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_orders_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'fulfilled'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."team_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price_delta" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_product_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "price_cents" integer NOT NULL,
    "image_url" "text",
    "visible" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cost_cents" integer,
    "external_url" "text"
);


ALTER TABLE "public"."team_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_staff_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_slug" "text" NOT NULL,
    "email" "text" NOT NULL,
    "normalized_email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "invited_by_account_id" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_staff_invitations_role_check" CHECK (("role" = ANY (ARRAY['assistant_coach'::"text", 'booster'::"text"])))
);


ALTER TABLE "public"."team_staff_invitations" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_reset_tokens"
    ADD CONSTRAINT "account_reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_comments"
    ADD CONSTRAINT "announcement_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_outreach"
    ADD CONSTRAINT "athlete_outreach_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athletes"
    ADD CONSTRAINT "athletes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_events"
    ADD CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_subscription_tokens"
    ADD CONSTRAINT "calendar_subscription_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_settings"
    ADD CONSTRAINT "campaign_settings_pkey" PRIMARY KEY ("campaign_slug");



ALTER TABLE ONLY "public"."campaign_settings"
    ADD CONSTRAINT "campaign_settings_team_id_key" UNIQUE ("team_id");



ALTER TABLE ONLY "public"."clearance_resources"
    ADD CONSTRAINT "clearance_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_crm_activities"
    ADD CONSTRAINT "coach_crm_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_crm_contacts"
    ADD CONSTRAINT "coach_crm_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_invite_tokens"
    ADD CONSTRAINT "coach_invite_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_organization_id_type_key" UNIQUE ("organization_id", "type");



ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."elf_accounts"
    ADD CONSTRAINT "elf_accounts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."elf_accounts"
    ADD CONSTRAINT "elf_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fund_uses"
    ADD CONSTRAINT "fund_uses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fundraising_contact_goals"
    ADD CONSTRAINT "fundraising_contact_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fundraising_contacts"
    ADD CONSTRAINT "fundraising_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_demo_requests"
    ADD CONSTRAINT "marketing_demo_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_thread_participants"
    ADD CONSTRAINT "message_thread_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_coach_reads"
    ADD CONSTRAINT "notification_coach_reads_notification_id_coach_id_key" UNIQUE ("notification_id", "coach_id");



ALTER TABLE ONLY "public"."notification_coach_reads"
    ADD CONSTRAINT "notification_coach_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_member_id_key" UNIQUE ("notification_id", "member_id");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."pending_athlete_requests"
    ADD CONSTRAINT "pending_athlete_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_platform_device_token_key" UNIQUE ("platform", "device_token");



ALTER TABLE ONLY "public"."push_preferences"
    ADD CONSTRAINT "push_preferences_pkey" PRIMARY KEY ("account_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_activities"
    ADD CONSTRAINT "sponsor_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_businesses"
    ADD CONSTRAINT "sponsor_businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_packages"
    ADD CONSTRAINT "sponsor_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_relationships"
    ADD CONSTRAINT "sponsor_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsors"
    ADD CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_coaches"
    ADD CONSTRAINT "team_coaches_email_campaign_slug_key" UNIQUE ("email", "campaign_slug");



ALTER TABLE ONLY "public"."team_coaches"
    ADD CONSTRAINT "team_coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_files"
    ADD CONSTRAINT "team_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_join_codes"
    ADD CONSTRAINT "team_join_codes_campaign_slug_key" UNIQUE ("campaign_slug");



ALTER TABLE ONLY "public"."team_join_codes"
    ADD CONSTRAINT "team_join_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."team_join_codes"
    ADD CONSTRAINT "team_join_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_member_athletes"
    ADD CONSTRAINT "team_member_athletes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_member_athletes"
    ADD CONSTRAINT "team_member_athletes_team_member_id_athlete_id_key" UNIQUE ("team_member_id", "athlete_id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_order_items"
    ADD CONSTRAINT "team_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_orders"
    ADD CONSTRAINT "team_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_orders"
    ADD CONSTRAINT "team_orders_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."team_product_variants"
    ADD CONSTRAINT "team_product_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_products"
    ADD CONSTRAINT "team_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_staff_invitations"
    ADD CONSTRAINT "team_staff_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_staff_invitations"
    ADD CONSTRAINT "team_staff_invitations_token_hash_key" UNIQUE ("token_hash");



CREATE INDEX "account_reset_tokens_account_idx" ON "public"."account_reset_tokens" USING "btree" ("account_id");



CREATE INDEX "account_reset_tokens_hash_idx" ON "public"."account_reset_tokens" USING "btree" ("token_hash");



CREATE INDEX "announcement_comments_announcement_id_idx" ON "public"."announcement_comments" USING "btree" ("announcement_id");



CREATE INDEX "announcement_comments_campaign_status_idx" ON "public"."announcement_comments" USING "btree" ("campaign_slug", "status");



CREATE INDEX "athlete_outreach_lookup_idx" ON "public"."athlete_outreach" USING "btree" ("campaign_slug", "athlete_id", "created_at" DESC);



CREATE INDEX "audit_logs_action_idx" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "audit_logs_campaign_slug_idx" ON "public"."audit_logs" USING "btree" ("campaign_slug");



CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_logs_entity_idx" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE UNIQUE INDEX "automation_events_open_unique" ON "public"."automation_events" USING "btree" ("rule_key", COALESCE("campaign_slug", ''::"text"), COALESCE(("coach_id")::"text", ''::"text"), COALESCE(("crm_contact_id")::"text", ''::"text")) WHERE ("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text"]));



CREATE INDEX "calendar_events_date_idx" ON "public"."calendar_events" USING "btree" ("event_date");



CREATE INDEX "calendar_events_slug_date_idx" ON "public"."calendar_events" USING "btree" ("campaign_slug", "event_date");



CREATE INDEX "calendar_events_slug_idx" ON "public"."calendar_events" USING "btree" ("campaign_slug");



CREATE UNIQUE INDEX "calendar_subscription_tokens_active_slug_idx" ON "public"."calendar_subscription_tokens" USING "btree" ("campaign_slug") WHERE ("revoked_at" IS NULL);



CREATE UNIQUE INDEX "campaign_settings_crm_contact_id_key" ON "public"."campaign_settings" USING "btree" ("crm_contact_id") WHERE ("crm_contact_id" IS NOT NULL);



CREATE INDEX "campaign_settings_is_demo_idx" ON "public"."campaign_settings" USING "btree" ("is_demo") WHERE ("is_demo" = true);



CREATE INDEX "clearance_resources_campaign_slug_idx" ON "public"."clearance_resources" USING "btree" ("campaign_slug", "sort_order");



CREATE UNIQUE INDEX "coach_crm_contacts_demo_request_id_key" ON "public"."coach_crm_contacts" USING "btree" ("demo_request_id") WHERE ("demo_request_id" IS NOT NULL);



CREATE INDEX "coach_invite_tokens_coach_id_idx" ON "public"."coach_invite_tokens" USING "btree" ("coach_id");



CREATE INDEX "coach_invite_tokens_token_hash_idx" ON "public"."coach_invite_tokens" USING "btree" ("token_hash");



CREATE INDEX "comm_templates_org_idx" ON "public"."communication_templates" USING "btree" ("organization_id");



CREATE INDEX "donations_campaign_slug_idx" ON "public"."donations" USING "btree" ("campaign_slug");



CREATE INDEX "fc_slug_athlete_idx" ON "public"."fundraising_contacts" USING "btree" ("campaign_slug", "athlete_id");



CREATE INDEX "fc_slug_idx" ON "public"."fundraising_contacts" USING "btree" ("campaign_slug");



CREATE UNIQUE INDEX "fcg_athlete_uniq" ON "public"."fundraising_contact_goals" USING "btree" ("campaign_slug", "athlete_id") WHERE ("athlete_id" IS NOT NULL);



CREATE UNIQUE INDEX "fcg_team_default_uniq" ON "public"."fundraising_contact_goals" USING "btree" ("campaign_slug") WHERE ("athlete_id" IS NULL);



CREATE INDEX "idx_automation_events_campaign_slug" ON "public"."automation_events" USING "btree" ("campaign_slug");



CREATE INDEX "idx_automation_events_coach_id" ON "public"."automation_events" USING "btree" ("coach_id");



CREATE INDEX "idx_automation_events_created_at" ON "public"."automation_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_automation_events_crm_contact_id" ON "public"."automation_events" USING "btree" ("crm_contact_id");



CREATE INDEX "idx_automation_events_severity" ON "public"."automation_events" USING "btree" ("severity");



CREATE INDEX "idx_automation_events_status" ON "public"."automation_events" USING "btree" ("status");



CREATE INDEX "idx_automation_runs_job_key" ON "public"."automation_runs" USING "btree" ("job_key");



CREATE INDEX "idx_automation_runs_started_at" ON "public"."automation_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_automation_runs_status" ON "public"."automation_runs" USING "btree" ("status");



CREATE INDEX "idx_automation_runs_trigger_type" ON "public"."automation_runs" USING "btree" ("trigger_type");



CREATE INDEX "idx_coach_crm_activities_contact_id" ON "public"."coach_crm_activities" USING "btree" ("contact_id");



CREATE INDEX "idx_coach_crm_contacts_next_follow_up" ON "public"."coach_crm_contacts" USING "btree" ("next_follow_up_at");



CREATE INDEX "idx_coach_crm_contacts_school_name" ON "public"."coach_crm_contacts" USING "btree" ("school_name");



CREATE INDEX "idx_coach_crm_contacts_sport" ON "public"."coach_crm_contacts" USING "btree" ("sport");



CREATE INDEX "idx_coach_crm_contacts_status" ON "public"."coach_crm_contacts" USING "btree" ("status");



CREATE INDEX "marketing_demo_requests_created_at_idx" ON "public"."marketing_demo_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "marketing_demo_requests_email_idx" ON "public"."marketing_demo_requests" USING "btree" ("lower"("email"));



CREATE INDEX "marketing_demo_requests_status_idx" ON "public"."marketing_demo_requests" USING "btree" ("status");



CREATE INDEX "message_threads_slug_idx" ON "public"."message_threads" USING "btree" ("campaign_slug", "last_message_at" DESC);



CREATE INDEX "messages_thread_idx" ON "public"."messages" USING "btree" ("thread_id", "created_at");



CREATE INDEX "mr_coach_id_idx" ON "public"."message_reads" USING "btree" ("coach_id");



CREATE UNIQUE INDEX "mr_coach_uniq" ON "public"."message_reads" USING "btree" ("message_id", "coach_id") WHERE ("coach_id" IS NOT NULL);



CREATE INDEX "mr_member_id_idx" ON "public"."message_reads" USING "btree" ("member_id");



CREATE UNIQUE INDEX "mr_member_uniq" ON "public"."message_reads" USING "btree" ("message_id", "member_id") WHERE ("member_id" IS NOT NULL);



CREATE UNIQUE INDEX "mr_participant_key_uniq" ON "public"."message_reads" USING "btree" ("message_id", "participant_key");



CREATE INDEX "mtp_coach_id_idx" ON "public"."message_thread_participants" USING "btree" ("coach_id");



CREATE UNIQUE INDEX "mtp_coach_uniq" ON "public"."message_thread_participants" USING "btree" ("thread_id", "coach_id") WHERE ("coach_id" IS NOT NULL);



CREATE INDEX "mtp_member_id_idx" ON "public"."message_thread_participants" USING "btree" ("member_id");



CREATE UNIQUE INDEX "mtp_member_uniq" ON "public"."message_thread_participants" USING "btree" ("thread_id", "member_id") WHERE ("member_id" IS NOT NULL);



CREATE UNIQUE INDEX "mtp_participant_key_uniq" ON "public"."message_thread_participants" USING "btree" ("thread_id", "participant_key");



CREATE INDEX "notification_coach_reads_coach_idx" ON "public"."notification_coach_reads" USING "btree" ("coach_id");



CREATE INDEX "notification_queue_channel_idx" ON "public"."notification_queue" USING "btree" ("channel");



CREATE INDEX "notification_queue_recipient_id_idx" ON "public"."notification_queue" USING "btree" ("recipient_id");



CREATE INDEX "notification_queue_scheduled_for_idx" ON "public"."notification_queue" USING "btree" ("scheduled_for");



CREATE INDEX "notification_queue_status_idx" ON "public"."notification_queue" USING "btree" ("status");



CREATE INDEX "notification_reads_member_idx" ON "public"."notification_reads" USING "btree" ("member_id");



CREATE INDEX "notifications_team_created_idx" ON "public"."notifications" USING "btree" ("team_id", "created_at" DESC);



CREATE INDEX "pending_athlete_requests_account_id_idx" ON "public"."pending_athlete_requests" USING "btree" ("account_id");



CREATE UNIQUE INDEX "pending_athlete_requests_active_uniq" ON "public"."pending_athlete_requests" USING "btree" ("account_id", "campaign_slug") WHERE ("status" = 'pending'::"text");



CREATE INDEX "pending_athlete_requests_campaign_slug_idx" ON "public"."pending_athlete_requests" USING "btree" ("campaign_slug");



CREATE INDEX "push_devices_account_active_idx" ON "public"."push_devices" USING "btree" ("account_id") WHERE "active";



CREATE INDEX "push_subscriptions_coach_idx" ON "public"."push_subscriptions" USING "btree" ("coach_id");



CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "public"."push_subscriptions" USING "btree" ("endpoint");



CREATE INDEX "push_subscriptions_member_idx" ON "public"."push_subscriptions" USING "btree" ("member_id");



CREATE INDEX "push_subscriptions_slug_idx" ON "public"."push_subscriptions" USING "btree" ("campaign_slug", "platform");



CREATE INDEX "sponsor_activities_business_id_idx" ON "public"."sponsor_activities" USING "btree" ("business_id");



CREATE INDEX "sponsor_businesses_city_idx" ON "public"."sponsor_businesses" USING "btree" ("city");



CREATE INDEX "sponsor_businesses_industry_idx" ON "public"."sponsor_businesses" USING "btree" ("industry");



CREATE INDEX "sponsor_businesses_next_renewal_idx" ON "public"."sponsor_businesses" USING "btree" ("next_renewal_at");



CREATE INDEX "sponsor_businesses_status_idx" ON "public"."sponsor_businesses" USING "btree" ("status");



CREATE INDEX "sponsor_packages_org_idx" ON "public"."sponsor_packages" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "sponsor_relationships_business_id_idx" ON "public"."sponsor_relationships" USING "btree" ("business_id");



CREATE INDEX "sponsor_relationships_campaign_slug_idx" ON "public"."sponsor_relationships" USING "btree" ("campaign_slug");



CREATE INDEX "team_coaches_account_id_idx" ON "public"."team_coaches" USING "btree" ("account_id") WHERE ("account_id" IS NOT NULL);



CREATE UNIQUE INDEX "team_coaches_campaign_slug_account_id_uniq" ON "public"."team_coaches" USING "btree" ("campaign_slug", "account_id") WHERE ("account_id" IS NOT NULL);



CREATE INDEX "team_files_slug_idx" ON "public"."team_files" USING "btree" ("campaign_slug");



CREATE INDEX "team_join_codes_code_idx" ON "public"."team_join_codes" USING "btree" ("code") WHERE (NOT "revoked");



CREATE INDEX "team_member_athletes_athlete_idx" ON "public"."team_member_athletes" USING "btree" ("athlete_id");



CREATE INDEX "team_member_athletes_member_idx" ON "public"."team_member_athletes" USING "btree" ("team_member_id");



CREATE INDEX "team_members_account_id_idx" ON "public"."team_members" USING "btree" ("account_id") WHERE ("account_id" IS NOT NULL);



CREATE UNIQUE INDEX "team_members_athlete_claim_uniq" ON "public"."team_members" USING "btree" ("athlete_id") WHERE (("role" = 'athlete'::"text") AND ("athlete_id" IS NOT NULL));



CREATE INDEX "team_members_campaign_slug_idx" ON "public"."team_members" USING "btree" ("campaign_slug");



CREATE INDEX "team_orders_slug_idx" ON "public"."team_orders" USING "btree" ("campaign_slug");



CREATE INDEX "team_product_variants_product_idx" ON "public"."team_product_variants" USING "btree" ("product_id");



CREATE INDEX "team_products_slug_idx" ON "public"."team_products" USING "btree" ("campaign_slug");



CREATE UNIQUE INDEX "team_staff_invitations_active_uniq" ON "public"."team_staff_invitations" USING "btree" ("campaign_slug", "normalized_email", "role") WHERE (("accepted_at" IS NULL) AND ("revoked_at" IS NULL));



CREATE INDEX "team_staff_invitations_campaign_slug_idx" ON "public"."team_staff_invitations" USING "btree" ("campaign_slug");



CREATE INDEX "team_staff_invitations_token_hash_idx" ON "public"."team_staff_invitations" USING "btree" ("token_hash");



ALTER TABLE ONLY "public"."account_reset_tokens"
    ADD CONSTRAINT "account_reset_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_comments"
    ADD CONSTRAINT "announcement_comments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_comments"
    ADD CONSTRAINT "announcement_comments_author_coach_id_fkey" FOREIGN KEY ("author_coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcement_comments"
    ADD CONSTRAINT "announcement_comments_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcement_comments"
    ADD CONSTRAINT "announcement_comments_decided_by_coach_id_fkey" FOREIGN KEY ("decided_by_coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."team_files"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_campaign_slug_fkey" FOREIGN KEY ("campaign_slug") REFERENCES "public"."campaign_settings"("campaign_slug") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_outreach"
    ADD CONSTRAINT "athlete_outreach_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_settings"
    ADD CONSTRAINT "campaign_settings_crm_contact_id_fkey" FOREIGN KEY ("crm_contact_id") REFERENCES "public"."coach_crm_contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clearance_resources"
    ADD CONSTRAINT "clearance_resources_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."team_files"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clearance_resources"
    ADD CONSTRAINT "clearance_resources_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_crm_activities"
    ADD CONSTRAINT "coach_crm_activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."coach_crm_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_crm_contacts"
    ADD CONSTRAINT "coach_crm_contacts_demo_request_id_fkey" FOREIGN KEY ("demo_request_id") REFERENCES "public"."marketing_demo_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_invite_tokens"
    ADD CONSTRAINT "coach_invite_tokens_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fundraising_contact_goals"
    ADD CONSTRAINT "fundraising_contact_goals_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fundraising_contact_goals"
    ADD CONSTRAINT "fundraising_contact_goals_set_by_coach_id_fkey" FOREIGN KEY ("set_by_coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fundraising_contacts"
    ADD CONSTRAINT "fundraising_contacts_added_by_coach_id_fkey" FOREIGN KEY ("added_by_coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fundraising_contacts"
    ADD CONSTRAINT "fundraising_contacts_added_by_member_id_fkey" FOREIGN KEY ("added_by_member_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fundraising_contacts"
    ADD CONSTRAINT "fundraising_contacts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_thread_participants"
    ADD CONSTRAINT "message_thread_participants_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_thread_participants"
    ADD CONSTRAINT "message_thread_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_thread_participants"
    ADD CONSTRAINT "message_thread_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_created_by_coach_id_fkey" FOREIGN KEY ("created_by_coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_coach_id_fkey" FOREIGN KEY ("sender_coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_member_id_fkey" FOREIGN KEY ("sender_member_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_coach_reads"
    ADD CONSTRAINT "notification_coach_reads_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_coach_reads"
    ADD CONSTRAINT "notification_coach_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."campaign_settings"("team_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_athlete_requests"
    ADD CONSTRAINT "pending_athlete_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_athlete_requests"
    ADD CONSTRAINT "pending_athlete_requests_decided_by_account_id_fkey" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_athlete_requests"
    ADD CONSTRAINT "pending_athlete_requests_matched_athlete_id_fkey" FOREIGN KEY ("matched_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_athlete_requests"
    ADD CONSTRAINT "pending_athlete_requests_resulting_athlete_id_fkey" FOREIGN KEY ("resulting_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_athlete_requests"
    ADD CONSTRAINT "pending_athlete_requests_resulting_member_id_fkey" FOREIGN KEY ("resulting_member_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_preferences"
    ADD CONSTRAINT "push_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."team_coaches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sponsor_activities"
    ADD CONSTRAINT "sponsor_activities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."sponsor_businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sponsor_packages"
    ADD CONSTRAINT "sponsor_packages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sponsor_relationships"
    ADD CONSTRAINT "sponsor_relationships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."sponsor_businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_coaches"
    ADD CONSTRAINT "team_coaches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_coaches"
    ADD CONSTRAINT "team_coaches_campaign_slug_fkey" FOREIGN KEY ("campaign_slug") REFERENCES "public"."campaign_settings"("campaign_slug") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_member_athletes"
    ADD CONSTRAINT "team_member_athletes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_member_athletes"
    ADD CONSTRAINT "team_member_athletes_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_order_items"
    ADD CONSTRAINT "team_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."team_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_order_items"
    ADD CONSTRAINT "team_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."team_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_order_items"
    ADD CONSTRAINT "team_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."team_product_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_product_variants"
    ADD CONSTRAINT "team_product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."team_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_staff_invitations"
    ADD CONSTRAINT "team_staff_invitations_invited_by_account_id_fkey" FOREIGN KEY ("invited_by_account_id") REFERENCES "public"."elf_accounts"("id") ON DELETE SET NULL;



ALTER TABLE "public"."account_reset_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_outreach" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athletes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_subscription_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clearance_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_crm_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_crm_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_invite_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."communication_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."elf_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fund_uses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fundraising_contact_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fundraising_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_demo_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_thread_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_coach_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_athlete_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read donations" ON "public"."donations" FOR SELECT USING (true);



ALTER TABLE "public"."push_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_businesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_coaches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_join_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_member_athletes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_product_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_staff_invitations" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."account_reset_tokens" TO "anon";
GRANT ALL ON TABLE "public"."account_reset_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."account_reset_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_comments" TO "anon";
GRANT ALL ON TABLE "public"."announcement_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_comments" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_outreach" TO "anon";
GRANT ALL ON TABLE "public"."athlete_outreach" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_outreach" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_outreach_current" TO "anon";
GRANT ALL ON TABLE "public"."athlete_outreach_current" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_outreach_current" TO "service_role";



GRANT ALL ON TABLE "public"."athletes" TO "anon";
GRANT ALL ON TABLE "public"."athletes" TO "authenticated";
GRANT ALL ON TABLE "public"."athletes" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_events" TO "anon";
GRANT ALL ON TABLE "public"."automation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_events" TO "service_role";



GRANT ALL ON TABLE "public"."automation_runs" TO "anon";
GRANT ALL ON TABLE "public"."automation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_subscription_tokens" TO "anon";
GRANT ALL ON TABLE "public"."calendar_subscription_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_subscription_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_settings" TO "anon";
GRANT ALL ON TABLE "public"."campaign_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_settings" TO "service_role";



GRANT ALL ON TABLE "public"."clearance_resources" TO "anon";
GRANT ALL ON TABLE "public"."clearance_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."clearance_resources" TO "service_role";



GRANT ALL ON TABLE "public"."coach_crm_activities" TO "anon";
GRANT ALL ON TABLE "public"."coach_crm_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_crm_activities" TO "service_role";



GRANT ALL ON TABLE "public"."coach_crm_contacts" TO "anon";
GRANT ALL ON TABLE "public"."coach_crm_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_crm_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."coach_invite_tokens" TO "anon";
GRANT ALL ON TABLE "public"."coach_invite_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_invite_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."communication_templates" TO "anon";
GRANT ALL ON TABLE "public"."communication_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_templates" TO "service_role";



GRANT ALL ON TABLE "public"."donations" TO "anon";
GRANT ALL ON TABLE "public"."donations" TO "authenticated";
GRANT ALL ON TABLE "public"."donations" TO "service_role";



GRANT ALL ON TABLE "public"."elf_accounts" TO "anon";
GRANT ALL ON TABLE "public"."elf_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."elf_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."fund_uses" TO "anon";
GRANT ALL ON TABLE "public"."fund_uses" TO "authenticated";
GRANT ALL ON TABLE "public"."fund_uses" TO "service_role";



GRANT ALL ON TABLE "public"."fundraising_contact_goals" TO "anon";
GRANT ALL ON TABLE "public"."fundraising_contact_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."fundraising_contact_goals" TO "service_role";



GRANT ALL ON TABLE "public"."fundraising_contacts" TO "anon";
GRANT ALL ON TABLE "public"."fundraising_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."fundraising_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_demo_requests" TO "anon";
GRANT ALL ON TABLE "public"."marketing_demo_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_demo_requests" TO "service_role";



GRANT ALL ON TABLE "public"."message_reads" TO "anon";
GRANT ALL ON TABLE "public"."message_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reads" TO "service_role";



GRANT ALL ON TABLE "public"."message_thread_participants" TO "anon";
GRANT ALL ON TABLE "public"."message_thread_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."message_thread_participants" TO "service_role";



GRANT ALL ON TABLE "public"."message_threads" TO "anon";
GRANT ALL ON TABLE "public"."message_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_threads" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notification_coach_reads" TO "anon";
GRANT ALL ON TABLE "public"."notification_coach_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_coach_reads" TO "service_role";



GRANT ALL ON TABLE "public"."notification_queue" TO "anon";
GRANT ALL ON TABLE "public"."notification_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_queue" TO "service_role";



GRANT ALL ON TABLE "public"."notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."pending_athlete_requests" TO "anon";
GRANT ALL ON TABLE "public"."pending_athlete_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_athlete_requests" TO "service_role";



GRANT ALL ON TABLE "public"."push_devices" TO "anon";
GRANT ALL ON TABLE "public"."push_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."push_devices" TO "service_role";



GRANT ALL ON TABLE "public"."push_preferences" TO "anon";
GRANT ALL ON TABLE "public"."push_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."push_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_activities" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_activities" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_businesses" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_businesses" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_packages" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_packages" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_relationships" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."sponsors" TO "anon";
GRANT ALL ON TABLE "public"."sponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsors" TO "service_role";



GRANT ALL ON TABLE "public"."team_coaches" TO "anon";
GRANT ALL ON TABLE "public"."team_coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."team_coaches" TO "service_role";



GRANT ALL ON TABLE "public"."team_files" TO "anon";
GRANT ALL ON TABLE "public"."team_files" TO "authenticated";
GRANT ALL ON TABLE "public"."team_files" TO "service_role";



GRANT ALL ON TABLE "public"."team_join_codes" TO "anon";
GRANT ALL ON TABLE "public"."team_join_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."team_join_codes" TO "service_role";



GRANT ALL ON TABLE "public"."team_member_athletes" TO "anon";
GRANT ALL ON TABLE "public"."team_member_athletes" TO "authenticated";
GRANT ALL ON TABLE "public"."team_member_athletes" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."team_order_items" TO "anon";
GRANT ALL ON TABLE "public"."team_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."team_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."team_orders" TO "anon";
GRANT ALL ON TABLE "public"."team_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."team_orders" TO "service_role";



GRANT ALL ON TABLE "public"."team_product_variants" TO "anon";
GRANT ALL ON TABLE "public"."team_product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."team_product_variants" TO "service_role";



GRANT ALL ON TABLE "public"."team_products" TO "anon";
GRANT ALL ON TABLE "public"."team_products" TO "authenticated";
GRANT ALL ON TABLE "public"."team_products" TO "service_role";



GRANT ALL ON TABLE "public"."team_staff_invitations" TO "anon";
GRANT ALL ON TABLE "public"."team_staff_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."team_staff_invitations" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







