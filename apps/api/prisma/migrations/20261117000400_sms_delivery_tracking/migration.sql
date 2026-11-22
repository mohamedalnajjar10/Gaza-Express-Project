ALTER TABLE sms_jobs MODIFY status ENUM('DELIVERED','PENDING','PROCESSING','ACCEPTED','FAILED','UNKNOWN','EXPIRED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN resolutionActorId INTEGER NULL,
  ADD COLUMN resolutionReason VARCHAR(250) NULL;
CREATE INDEX sms_jobs_status_updatedAt_idx ON sms_jobs(status, updatedAt);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);
CREATE INDEX notifications_createdAt_idx ON notifications(createdAt);
