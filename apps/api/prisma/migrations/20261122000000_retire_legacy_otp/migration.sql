START TRANSACTION;

UPDATE `sms_jobs` AS job
JOIN `otp_codes` AS otp ON otp.`otp_id` = job.`otpId`
SET job.`status` = CASE WHEN job.`status` = 'PROCESSING' THEN 'UNKNOWN' ELSE 'EXPIRED' END,
    job.`payload` = NULL,
    job.`leaseUntil` = NULL,
    job.`errorCode` = 'legacy_challenge',
    job.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE otp.`challenge` IS NULL AND job.`status` IN ('PENDING', 'PROCESSING');

UPDATE `otp_codes`
SET `is_used` = TRUE
WHERE `challenge` IS NULL AND `is_used` = FALSE;

COMMIT;
