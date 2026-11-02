-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "weekStart" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "manager_id" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "leader_id" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "role_id" UUID NOT NULL,
    "department_id" UUID,
    "team_id" UUID,
    "manager_id" UUID,
    "join_date" DATE,
    "totp_secret_enc" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "disabled_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'own',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_permission_overrides" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'own',

    CONSTRAINT "employee_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "hardware_hash" TEXT NOT NULL,
    "os_version" TEXT NOT NULL,
    "app_version" TEXT,
    "agent_version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "release_channel" TEXT NOT NULL DEFAULT 'stable',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "device_id" UUID,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revoked_reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "identifier" TEXT NOT NULL,
    "device_id" UUID,
    "ip" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "device_id" UUID,
    "ip" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_schedules" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "workdays" INTEGER[],
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,
    "grace_minutes" INTEGER NOT NULL DEFAULT 10,
    "half_day_percent" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shift_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedules" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "employee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "state" TEXT NOT NULL DEFAULT 'WORKING',
    "end_reason" TEXT,
    "last_heartbeat_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duration_s" INTEGER NOT NULL DEFAULT 0,
    "break_s" INTEGER NOT NULL DEFAULT 0,
    "offline_s" INTEGER NOT NULL DEFAULT 0,
    "active_s" INTEGER NOT NULL DEFAULT 0,
    "idle_s" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_breaks" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "shift_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_events" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "client_event_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "break_type" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconstructed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shift_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "schedule_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'present',
    "check_in_at" TIMESTAMPTZ,
    "check_out_at" TIMESTAMPTZ,
    "working_s" INTEGER NOT NULL DEFAULT 0,
    "active_s" INTEGER NOT NULL DEFAULT 0,
    "idle_s" INTEGER NOT NULL DEFAULT 0,
    "break_s" INTEGER NOT NULL DEFAULT 0,
    "offline_s" INTEGER NOT NULL DEFAULT 0,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "requested_start" TIMESTAMPTZ,
    "requested_end" TIMESTAMPTZ,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_segments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "process_name" TEXT NOT NULL,
    "app_name" TEXT NOT NULL,
    "domain" TEXT,
    "window_title" TEXT,
    "key_count" INTEGER NOT NULL DEFAULT 0,
    "mouse_count" INTEGER NOT NULL DEFAULT 0,
    "exception" TEXT NOT NULL DEFAULT 'none',
    "claim" TEXT NOT NULL DEFAULT 'none',
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "late" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "activity_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_daily_app" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "app_name" TEXT NOT NULL,
    "process_name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'neutral',
    "active_s" INTEGER NOT NULL DEFAULT 0,
    "idle_s" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "activity_daily_app_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_daily_domain" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "domain" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'neutral',
    "active_s" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "activity_daily_domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_daily_summary" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "tracked_s" INTEGER NOT NULL DEFAULT 0,
    "active_s" INTEGER NOT NULL DEFAULT 0,
    "idle_s" INTEGER NOT NULL DEFAULT 0,
    "productive_s" INTEGER NOT NULL DEFAULT 0,
    "neutral_s" INTEGER NOT NULL DEFAULT 0,
    "unproductive_s" INTEGER NOT NULL DEFAULT 0,
    "key_count" INTEGER NOT NULL DEFAULT 0,
    "mouse_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "activity_daily_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_rules" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "department_id" UUID,

    CONSTRAINT "productivity_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_exclusions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,

    CONSTRAINT "tracking_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_exception_apps" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "process_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "activity_exception_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tamper_events" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tamper_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT 'lead',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'open',
    "counts_as_qualified" BOOLEAN NOT NULL DEFAULT false,
    "counts_as_meeting" BOOLEAN NOT NULL DEFAULT false,
    "probability" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "owner_id" UUID,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "source_id" UUID,
    "value" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "follow_up_at" TIMESTAMPTZ,
    "do_not_call" BOOLEAN NOT NULL DEFAULT false,
    "is_client" BOOLEAN NOT NULL DEFAULT false,
    "won_at" TIMESTAMPTZ,
    "lost_at" TIMESTAMPTZ,
    "lost_reason_id" UUID,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "qualified_at" TIMESTAMPTZ,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "converted_at" TIMESTAMPTZ,
    "contact_id" UUID,
    "account_id" UUID,
    "deal_id" UUID,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_phones" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Mobile',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lead_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_emails" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "email_lower" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Work',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lead_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_timeline" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" TEXT NOT NULL,
    "ref_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignee_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "lead_id" UUID,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "due_at" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "completed_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" JSONB NOT NULL DEFAULT '{}',
    "owner_id" UUID,
    "lifecycle" TEXT NOT NULL DEFAULT 'prospect',
    "parent_account_id" UUID,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "crm_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL DEFAULT '',
    "title" TEXT,
    "account_id" UUID,
    "owner_id" UUID,
    "lifecycle" TEXT NOT NULL DEFAULT 'lead',
    "address" JSONB NOT NULL DEFAULT '{}',
    "do_not_call" BOOLEAN NOT NULL DEFAULT false,
    "do_not_email" BOOLEAN NOT NULL DEFAULT false,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "lead_id" UUID,
    "created_by" UUID,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contact_phones" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Mobile',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "crm_contact_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contact_emails" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "email_lower" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Work',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "crm_contact_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "account_id" UUID,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expected_close_at" TIMESTAMPTZ,
    "owner_id" UUID,
    "won_at" TIMESTAMPTZ,
    "lost_at" TIMESTAMPTZ,
    "lost_reason_id" UUID,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "lead_id" UUID,
    "created_by" UUID,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_contacts" (
    "deal_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "role" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "deal_contacts_pkey" PRIMARY KEY ("deal_id","contact_id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" UUID,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT,
    "due_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "duration_s" INTEGER,
    "data" JSONB NOT NULL DEFAULT '{}',
    "ref_type" TEXT,
    "ref_id" UUID,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_reasons" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lost_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '#5C666E',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_tags" (
    "company_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "record_tags_pkey" PRIMARY KEY ("entity_type","entity_id","tag_id")
);

-- CreateTable
CREATE TABLE "custom_field_defs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "custom_field_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sort" JSONB,
    "columns" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "uploader_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '[]',
    "preview" JSONB NOT NULL DEFAULT '[]',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'mapping',
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '{}',
    "totals" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "targets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "assignee_type" TEXT NOT NULL,
    "assignee_id" UUID NOT NULL,
    "metric_key" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_events" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "metric_key" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 1.0,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_date" DATE NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,

    CONSTRAINT "metric_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailboxes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "google_user_id" TEXT,
    "refresh_token_enc" TEXT NOT NULL,
    "token_status" TEXT NOT NULL DEFAULT 'ok',
    "history_id" TEXT,
    "watch_expires_at" TIMESTAMPTZ,
    "last_sync_at" TIMESTAMPTZ,
    "signature_html" TEXT,
    "connected_by" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_assignments" (
    "id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "permissions" TEXT[],
    "assigned_by" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_threads" (
    "id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "gmail_thread_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "last_message_at" TIMESTAMPTZ NOT NULL,
    "unread" BOOLEAN NOT NULL DEFAULT false,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "label_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lead_id" UUID,

    CONSTRAINT "mail_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "from_addr" TEXT NOT NULL,
    "to_addrs" TEXT[],
    "cc_addrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sent_at" TIMESTAMPTZ NOT NULL,
    "snippet" TEXT,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "sent_by_employee_id" UUID,

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_audit" (
    "id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "gmail_message_id" TEXT,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "ip" TEXT NOT NULL,
    "device_id" UUID,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT NOT NULL,
    "device_id" UUID,
    "client" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alerts" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "employee_id" UUID,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_releases" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "min_supported" TEXT,
    "notes" TEXT,
    "installer_key" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departments_company_id_idx" ON "departments"("company_id");

-- CreateIndex
CREATE INDEX "teams_company_id_idx" ON "teams"("company_id");

-- CreateIndex
CREATE INDEX "teams_department_id_idx" ON "teams"("department_id");

-- CreateIndex
CREATE INDEX "employees_company_id_idx" ON "employees"("company_id");

-- CreateIndex
CREATE INDEX "employees_role_id_idx" ON "employees"("role_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_team_id_idx" ON "employees"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_code_key" ON "employees"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_email_key" ON "employees"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_key_key" ON "role_permissions"("role_id", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "employee_permission_overrides_employee_id_permission_key_key" ON "employee_permission_overrides"("employee_id", "permission_key");

-- CreateIndex
CREATE INDEX "devices_company_id_idx" ON "devices"("company_id");

-- CreateIndex
CREATE INDEX "devices_employee_id_idx" ON "devices"("employee_id");

-- CreateIndex
CREATE INDEX "sessions_employee_id_idx" ON "sessions"("employee_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE INDEX "sessions_refresh_token_hash_idx" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "login_events_identifier_idx" ON "login_events"("identifier");

-- CreateIndex
CREATE INDEX "login_events_ip_idx" ON "login_events"("ip");

-- CreateIndex
CREATE INDEX "consent_records_employee_id_idx" ON "consent_records"("employee_id");

-- CreateIndex
CREATE INDEX "shift_schedules_company_id_idx" ON "shift_schedules"("company_id");

-- CreateIndex
CREATE INDEX "employee_schedules_employee_id_idx" ON "employee_schedules"("employee_id");

-- CreateIndex
CREATE INDEX "employee_schedules_schedule_id_idx" ON "employee_schedules"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_company_id_date_key" ON "holidays"("company_id", "date");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_idx" ON "leave_requests"("employee_id");

-- CreateIndex
CREATE INDEX "shifts_employee_id_state_idx" ON "shifts"("employee_id", "state");

-- CreateIndex
CREATE INDEX "shifts_employee_id_attendance_date_idx" ON "shifts"("employee_id", "attendance_date");

-- CreateIndex
CREATE INDEX "shift_breaks_shift_id_idx" ON "shift_breaks"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_events_client_event_id_key" ON "shift_events"("client_event_id");

-- CreateIndex
CREATE INDEX "shift_events_shift_id_idx" ON "shift_events"("shift_id");

-- CreateIndex
CREATE INDEX "attendance_days_date_idx" ON "attendance_days"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_employee_id_date_key" ON "attendance_days"("employee_id", "date");

-- CreateIndex
CREATE INDEX "attendance_corrections_employee_id_date_idx" ON "attendance_corrections"("employee_id", "date");

-- CreateIndex
CREATE INDEX "activity_segments_employee_id_started_at_idx" ON "activity_segments"("employee_id", "started_at");

-- CreateIndex
CREATE INDEX "activity_segments_shift_id_idx" ON "activity_segments"("shift_id");

-- CreateIndex
CREATE INDEX "activity_daily_app_date_idx" ON "activity_daily_app"("date");

-- CreateIndex
CREATE UNIQUE INDEX "activity_daily_app_employee_id_date_process_name_key" ON "activity_daily_app"("employee_id", "date", "process_name");

-- CreateIndex
CREATE INDEX "activity_daily_domain_date_idx" ON "activity_daily_domain"("date");

-- CreateIndex
CREATE UNIQUE INDEX "activity_daily_domain_employee_id_date_domain_key" ON "activity_daily_domain"("employee_id", "date", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "activity_daily_summary_employee_id_date_key" ON "activity_daily_summary"("employee_id", "date");

-- CreateIndex
CREATE INDEX "productivity_rules_company_id_idx" ON "productivity_rules"("company_id");

-- CreateIndex
CREATE INDEX "tracking_exclusions_company_id_idx" ON "tracking_exclusions"("company_id");

-- CreateIndex
CREATE INDEX "activity_exception_apps_company_id_idx" ON "activity_exception_apps"("company_id");

-- CreateIndex
CREATE INDEX "tamper_events_employee_id_idx" ON "tamper_events"("employee_id");

-- CreateIndex
CREATE INDEX "tamper_events_device_id_idx" ON "tamper_events"("device_id");

-- CreateIndex
CREATE INDEX "pipelines_company_id_idx" ON "pipelines"("company_id");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_idx" ON "pipeline_stages"("pipeline_id");

-- CreateIndex
CREATE INDEX "leads_company_id_idx" ON "leads"("company_id");

-- CreateIndex
CREATE INDEX "leads_owner_id_idx" ON "leads"("owner_id");

-- CreateIndex
CREATE INDEX "leads_pipeline_id_idx" ON "leads"("pipeline_id");

-- CreateIndex
CREATE INDEX "leads_stage_id_idx" ON "leads"("stage_id");

-- CreateIndex
CREATE INDEX "leads_follow_up_at_idx" ON "leads"("follow_up_at");

-- CreateIndex
CREATE INDEX "lead_phones_lead_id_idx" ON "lead_phones"("lead_id");

-- CreateIndex
CREATE INDEX "lead_phones_phone_e164_idx" ON "lead_phones"("phone_e164");

-- CreateIndex
CREATE INDEX "lead_emails_lead_id_idx" ON "lead_emails"("lead_id");

-- CreateIndex
CREATE INDEX "lead_emails_email_lower_idx" ON "lead_emails"("email_lower");

-- CreateIndex
CREATE INDEX "lead_timeline_lead_id_idx" ON "lead_timeline"("lead_id");

-- CreateIndex
CREATE INDEX "lead_timeline_occurred_at_idx" ON "lead_timeline"("occurred_at");

-- CreateIndex
CREATE INDEX "lead_notes_lead_id_idx" ON "lead_notes"("lead_id");

-- CreateIndex
CREATE INDEX "call_logs_lead_id_idx" ON "call_logs"("lead_id");

-- CreateIndex
CREATE INDEX "call_logs_employee_id_idx" ON "call_logs"("employee_id");

-- CreateIndex
CREATE INDEX "appointments_lead_id_idx" ON "appointments"("lead_id");

-- CreateIndex
CREATE INDEX "appointments_employee_id_idx" ON "appointments"("employee_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "tasks_lead_id_idx" ON "tasks"("lead_id");

-- CreateIndex
CREATE INDEX "tasks_due_at_idx" ON "tasks"("due_at");

-- CreateIndex
CREATE INDEX "crm_accounts_company_id_name_normalized_idx" ON "crm_accounts"("company_id", "name_normalized");

-- CreateIndex
CREATE INDEX "crm_accounts_company_id_domain_idx" ON "crm_accounts"("company_id", "domain");

-- CreateIndex
CREATE INDEX "crm_accounts_owner_id_idx" ON "crm_accounts"("owner_id");

-- CreateIndex
CREATE INDEX "crm_contacts_company_id_idx" ON "crm_contacts"("company_id");

-- CreateIndex
CREATE INDEX "crm_contacts_account_id_idx" ON "crm_contacts"("account_id");

-- CreateIndex
CREATE INDEX "crm_contacts_owner_id_idx" ON "crm_contacts"("owner_id");

-- CreateIndex
CREATE INDEX "crm_contacts_company_id_last_name_first_name_idx" ON "crm_contacts"("company_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "crm_contact_phones_contact_id_idx" ON "crm_contact_phones"("contact_id");

-- CreateIndex
CREATE INDEX "crm_contact_phones_phone_e164_idx" ON "crm_contact_phones"("phone_e164");

-- CreateIndex
CREATE INDEX "crm_contact_emails_contact_id_idx" ON "crm_contact_emails"("contact_id");

-- CreateIndex
CREATE INDEX "crm_contact_emails_email_lower_idx" ON "crm_contact_emails"("email_lower");

-- CreateIndex
CREATE INDEX "deals_company_id_idx" ON "deals"("company_id");

-- CreateIndex
CREATE INDEX "deals_owner_id_idx" ON "deals"("owner_id");

-- CreateIndex
CREATE INDEX "deals_account_id_idx" ON "deals"("account_id");

-- CreateIndex
CREATE INDEX "deals_pipeline_id_stage_id_idx" ON "deals"("pipeline_id", "stage_id");

-- CreateIndex
CREATE INDEX "deals_expected_close_at_idx" ON "deals"("expected_close_at");

-- CreateIndex
CREATE INDEX "deal_contacts_contact_id_idx" ON "deal_contacts"("contact_id");

-- CreateIndex
CREATE INDEX "crm_activities_company_id_entity_type_entity_id_occurred_at_idx" ON "crm_activities"("company_id", "entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "crm_activities_company_id_actor_id_due_at_idx" ON "crm_activities"("company_id", "actor_id", "due_at");

-- CreateIndex
CREATE INDEX "crm_activities_company_id_status_due_at_idx" ON "crm_activities"("company_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_company_id_name_key" ON "lead_sources"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "lost_reasons_company_id_name_key" ON "lost_reasons"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_company_id_name_key" ON "tags"("company_id", "name");

-- CreateIndex
CREATE INDEX "record_tags_company_id_tag_id_idx" ON "record_tags"("company_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_defs_company_id_entity_type_key_key" ON "custom_field_defs"("company_id", "entity_type", "key");

-- CreateIndex
CREATE INDEX "saved_views_company_id_entity_type_owner_id_idx" ON "saved_views"("company_id", "entity_type", "owner_id");

-- CreateIndex
CREATE INDEX "import_jobs_company_id_uploader_id_idx" ON "import_jobs"("company_id", "uploader_id");

-- CreateIndex
CREATE INDEX "targets_company_id_idx" ON "targets"("company_id");

-- CreateIndex
CREATE INDEX "targets_assignee_id_idx" ON "targets"("assignee_id");

-- CreateIndex
CREATE INDEX "metric_events_employee_id_metric_key_period_date_idx" ON "metric_events"("employee_id", "metric_key", "period_date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_events_metric_key_ref_type_ref_id_key" ON "metric_events"("metric_key", "ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "mailboxes_address_key" ON "mailboxes"("address");

-- CreateIndex
CREATE INDEX "mailboxes_company_id_idx" ON "mailboxes"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_assignments_mailbox_id_employee_id_key" ON "mailbox_assignments"("mailbox_id", "employee_id");

-- CreateIndex
CREATE INDEX "mail_threads_mailbox_id_last_message_at_idx" ON "mail_threads"("mailbox_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "mail_threads_mailbox_id_gmail_thread_id_key" ON "mail_threads"("mailbox_id", "gmail_thread_id");

-- CreateIndex
CREATE INDEX "mail_messages_thread_id_idx" ON "mail_messages"("thread_id");

-- CreateIndex
CREATE INDEX "mail_messages_gmail_message_id_idx" ON "mail_messages"("gmail_message_id");

-- CreateIndex
CREATE INDEX "mail_audit_mailbox_id_idx" ON "mail_audit"("mailbox_id");

-- CreateIndex
CREATE INDEX "mail_audit_employee_id_idx" ON "mail_audit"("employee_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_occurred_at_idx" ON "audit_logs"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "security_alerts_severity_idx" ON "security_alerts"("severity");

-- CreateIndex
CREATE INDEX "app_releases_company_id_channel_idx" ON "app_releases"("company_id", "channel");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_permission_overrides" ADD CONSTRAINT "employee_permission_overrides_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "shift_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "shift_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_segments" ADD CONSTRAINT "activity_segments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_rules" ADD CONSTRAINT "productivity_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_exclusions" ADD CONSTRAINT "tracking_exclusions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_exception_apps" ADD CONSTRAINT "activity_exception_apps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_reason_id_fkey" FOREIGN KEY ("lost_reason_id") REFERENCES "lost_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_emails" ADD CONSTRAINT "lead_emails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_timeline" ADD CONSTRAINT "lead_timeline_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contact_phones" ADD CONSTRAINT "crm_contact_phones_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contact_emails" ADD CONSTRAINT "crm_contact_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lost_reason_id_fkey" FOREIGN KEY ("lost_reason_id") REFERENCES "lost_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_reasons" ADD CONSTRAINT "lost_reasons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_tags" ADD CONSTRAINT "record_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_defs" ADD CONSTRAINT "custom_field_defs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targets" ADD CONSTRAINT "targets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_assignments" ADD CONSTRAINT "mailbox_assignments_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_assignments" ADD CONSTRAINT "mailbox_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "mail_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

