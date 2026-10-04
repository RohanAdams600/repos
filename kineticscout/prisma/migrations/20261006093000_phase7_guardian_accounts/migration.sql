-- Phase 7: guardian accounts. A parent or guardian who signs in can report a message from their
-- account, so a GUARDIAN report may now carry the reporter's user id (null still means the
-- signed email link). Athlete and coach reports always carry one.
ALTER TABLE "message_reports" DROP CONSTRAINT "message_reports_reporter";
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter" CHECK ("reporter_kind" = 'GUARDIAN' OR "reporter_id" IS NOT NULL);
