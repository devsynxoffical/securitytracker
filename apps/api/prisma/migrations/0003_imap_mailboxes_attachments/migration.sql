-- AlterTable
ALTER TABLE "mail_messages" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "uid" INTEGER;

-- AlterTable
ALTER TABLE "mailboxes" ADD COLUMN     "imap_host" TEXT,
ADD COLUMN     "imap_port" INTEGER,
ADD COLUMN     "imap_secure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_uid" INTEGER,
ADD COLUMN     "last_uid_validity" INTEGER,
ADD COLUMN     "password_enc" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'gmail',
ADD COLUMN     "smtp_host" TEXT,
ADD COLUMN     "smtp_port" INTEGER,
ADD COLUMN     "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "username" TEXT,
ALTER COLUMN "refresh_token_enc" DROP NOT NULL;

