-- AlterTable
ALTER TABLE "support_ticket_messages" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];
