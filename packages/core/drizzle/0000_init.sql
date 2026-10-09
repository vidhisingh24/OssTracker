CREATE TYPE "public"."ball" AS ENUM('you', 'maintainer', 'ci', 'nobody');--> statement-breakpoint
CREATE TYPE "public"."ci_state" AS ENUM('passing', 'failing', 'pending', 'none');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('issue', 'pr', 'discussion');--> statement-breakpoint
CREATE TYPE "public"."item_source" AS ENUM('github', 'manual', 'planned');--> statement-breakpoint
CREATE TYPE "public"."item_state" AS ENUM('open', 'closed', 'merged');--> statement-breakpoint
CREATE TYPE "public"."link_relation" AS ENUM('closes', 'closed_by', 'references', 'manual');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('researching', 'contributing', 'proposal_drafted', 'submitted', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('P0', 'P1', 'P2', 'P3');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('planning', 'applying', 'applied', 'accepted', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."repo_role" AS ENUM('none', 'contributor', 'maintainer');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('discovered', 'claimed', 'in_progress', 'pr_draft', 'pr_open', 'in_review', 'changes_requested', 'approved', 'merged', 'closed', 'stale');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('hot', 'warm', 'cold', 'notifications', 'item', 'demo');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('queued', 'running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "check_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'check_run' NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"url" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"author" text NOT NULL,
	"author_avatar_url" text,
	"author_association" text,
	"body" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone NOT NULL,
	"is_maintainer" boolean DEFAULT false NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"is_mine" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_account" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"node_id" text,
	"encrypted_token" text NOT NULL,
	"scopes" text,
	"token_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"type" text NOT NULL,
	"actor" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"read_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" text NOT NULL,
	"linked_item_id" text,
	"linked_url" text NOT NULL,
	"linked_title" text,
	"linked_number" integer,
	"linked_repo" text,
	"linked_kind" "item_kind",
	"linked_state" "item_state",
	"relation" "link_relation" NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"repo_id" text,
	"repo_full_name" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"number" integer,
	"title" text NOT NULL,
	"body" text,
	"state" "item_state" DEFAULT 'open' NOT NULL,
	"state_reason" text,
	"is_draft" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"author" text,
	"author_avatar_url" text,
	"author_association" text,
	"gh_created_at" timestamp with time zone,
	"gh_updated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"merged_by" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignees" text[] DEFAULT '{}'::text[] NOT NULL,
	"milestone" text,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"my_relation" text[] DEFAULT '{}'::text[] NOT NULL,
	"url" text,
	"source" "item_source" DEFAULT 'github' NOT NULL,
	"base_ref" text,
	"head_ref" text,
	"additions" integer,
	"deletions" integer,
	"changed_files" integer,
	"mergeable" text,
	"merge_state_status" text,
	"review_decision" text,
	"review_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unresolved_threads" integer DEFAULT 0 NOT NULL,
	"ci_state" "ci_state" DEFAULT 'none' NOT NULL,
	"head_sha" text,
	"stage" "stage" DEFAULT 'discovered' NOT NULL,
	"ball" "ball" DEFAULT 'nobody' NOT NULL,
	"attention_score" real DEFAULT 0 NOT NULL,
	"attention_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_action" text,
	"last_activity_at" timestamp with time zone,
	"last_maintainer_activity_at" timestamp with time zone,
	"last_my_activity_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"is_stale" boolean DEFAULT false NOT NULL,
	"raw_snapshot" jsonb,
	"last_hydrated_at" timestamp with time zone,
	"hydrate_error" text,
	"is_gone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text,
	"reason" text NOT NULL,
	"title" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_url" text,
	"html_url" text,
	"repo_full_name" text NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"org" text NOT NULL,
	"display_name" text,
	"status" "org_status" DEFAULT 'researching' NOT NULL,
	"mentors" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "program_status" DEFAULT 'planning' NOT NULL,
	"url" text,
	"description" text,
	"deadlines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"resource" text NOT NULL,
	"bucket" text DEFAULT 'default' NOT NULL,
	"limit" integer NOT NULL,
	"remaining" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limits_resource_bucket_pk" PRIMARY KEY("resource","bucket")
);
--> statement-breakpoint
CREATE TABLE "repo_meta" (
	"repo_full_name" text PRIMARY KEY NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"program_tag" text,
	"notes" text,
	"setup_commands" text,
	"channel" text,
	"maintainers" text[] DEFAULT '{}'::text[] NOT NULL,
	"cla_required" boolean,
	"dco_required" boolean,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"description" text,
	"stars" integer DEFAULT 0 NOT NULL,
	"language" text,
	"language_color" text,
	"default_branch" text,
	"is_fork" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"my_role" "repo_role" DEFAULT 'none' NOT NULL,
	"url" text NOT NULL,
	"owner_avatar_url" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"reviewer" text NOT NULL,
	"reviewer_avatar_url" text,
	"reviewer_association" text,
	"state" "review_state" NOT NULL,
	"submitted_at" timestamp with time zone,
	"body" text,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"page" text DEFAULT 'items' NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_touched" integer DEFAULT 0 NOT NULL,
	"events_created" integer DEFAULT 0 NOT NULL,
	"api_cost" integer DEFAULT 0 NOT NULL,
	"rate_remaining" integer,
	"error" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{"phase":"starting","done":0,"total":0}'::jsonb NOT NULL,
	"target" text
);
--> statement-breakpoint
CREATE TABLE "user_meta" (
	"item_id" text PRIMARY KEY NOT NULL,
	"personal_stage" "stage",
	"priority" "priority",
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone,
	"remind_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"ball_override" "ball",
	"waiting_on" text,
	"last_viewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_links" ADD CONSTRAINT "item_links_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_links" ADD CONSTRAINT "item_links_linked_item_id_items_id_fk" FOREIGN KEY ("linked_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_orgs" ADD CONSTRAINT "program_orgs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_meta" ADD CONSTRAINT "user_meta_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_runs_item_idx" ON "check_runs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "comments_item_idx" ON "comments" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "item_events_item_idx" ON "item_events" USING btree ("item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "item_events_occurred_idx" ON "item_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "item_events_dedupe_idx" ON "item_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "item_events_unread_idx" ON "item_events" USING btree ("read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "item_links_unique_idx" ON "item_links" USING btree ("item_id","linked_url");--> statement-breakpoint
CREATE INDEX "item_links_linked_idx" ON "item_links" USING btree ("linked_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_repo_number_idx" ON "items" USING btree (lower("repo_full_name"),"number") WHERE "items"."number" is not null;--> statement-breakpoint
CREATE INDEX "items_repo_idx" ON "items" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "items_state_idx" ON "items" USING btree ("state");--> statement-breakpoint
CREATE INDEX "items_stage_idx" ON "items" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "items_attention_idx" ON "items" USING btree ("attention_score");--> statement-breakpoint
CREATE INDEX "items_gh_updated_idx" ON "items" USING btree ("gh_updated_at");--> statement-breakpoint
CREATE INDEX "items_last_hydrated_idx" ON "items" USING btree ("last_hydrated_at");--> statement-breakpoint
CREATE INDEX "items_kind_state_idx" ON "items" USING btree ("kind","state");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("unread","updated_at");--> statement-breakpoint
CREATE INDEX "notifications_item_idx" ON "notifications" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "outbound_pings_sent_idx" ON "outbound_pings" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "program_orgs_program_idx" ON "program_orgs" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repos_full_name_idx" ON "repos" USING btree (lower("full_name"));--> statement-breakpoint
CREATE INDEX "repos_owner_idx" ON "repos" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "reviews_item_idx" ON "reviews" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "reviews_submitted_idx" ON "reviews" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_kind_idx" ON "sync_runs" USING btree ("kind","started_at");