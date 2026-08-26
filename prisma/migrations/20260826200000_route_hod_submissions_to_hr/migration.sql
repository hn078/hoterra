-- Drafts do not enter the approval workflow until the owning department HoD
-- explicitly approves and sends them.
ALTER TYPE "WorkforceRequestStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';
