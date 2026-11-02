-- CreateTable
CREATE TABLE "chat_channels" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" UUID,
    "team_id" UUID,
    "direct_key" TEXT,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ,
    "last_message_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_members" (
    "channel_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_message_id" UUID,
    "muted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chat_members_pkey" PRIMARY KEY ("channel_id","employee_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" UUID[] DEFAULT ARRAY[]::UUID[],
    "record_ref" JSONB,
    "client_key" TEXT,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "body")) STORED,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_channels_company_id_last_message_at_idx" ON "chat_channels"("company_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_channels_company_id_kind_department_id_key" ON "chat_channels"("company_id", "kind", "department_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_channels_company_id_kind_team_id_key" ON "chat_channels"("company_id", "kind", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_channels_company_id_direct_key_key" ON "chat_channels"("company_id", "direct_key");

-- CreateIndex
CREATE INDEX "chat_members_employee_id_idx" ON "chat_members"("employee_id");

-- CreateIndex
CREATE INDEX "chat_messages_channel_id_id_idx" ON "chat_messages"("channel_id", "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_author_id_client_key_key" ON "chat_messages"("author_id", "client_key");

-- CreateIndex (full-text search, FR-CHAT-09)
CREATE INDEX "chat_messages_search_idx" ON "chat_messages" USING GIN ("search");

-- AddForeignKey
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

