ALTER TABLE `bank_receipts`
    ADD COLUMN `rawSha256` CHAR(64) NULL,
    ADD COLUMN `perceptualHash` CHAR(16) NULL,
    ADD COLUMN `imageWidth` INTEGER NULL,
    ADD COLUMN `imageHeight` INTEGER NULL,
    ADD COLUMN `originalFormat` VARCHAR(16) NULL,
    ADD COLUMN `transferReference` VARCHAR(100) NULL,
    ADD COLUMN `senderPhone` VARCHAR(20) NULL,
    ADD COLUMN `verificationStatus` VARCHAR(32) NOT NULL DEFAULT 'AUTO_CHECKED',
    ADD COLUMN `riskLevel` VARCHAR(16) NOT NULL DEFAULT 'LOW',
    ADD COLUMN `riskScore` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `forensicReport` JSON NULL,
    ADD COLUMN `reportedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewNote` VARCHAR(500) NULL;

CREATE INDEX `bank_receipts_rawSha256_idx` ON `bank_receipts`(`rawSha256`);
CREATE INDEX `bank_receipts_perceptualHash_idx` ON `bank_receipts`(`perceptualHash`);
CREATE INDEX `bank_receipts_transferReference_idx` ON `bank_receipts`(`transferReference`);
CREATE INDEX `bank_receipts_verificationStatus_submittedAt_idx` ON `bank_receipts`(`verificationStatus`, `submittedAt`);
CREATE INDEX `bank_receipts_decision_reportedAt_idx` ON `bank_receipts`(`decision`, `reportedAt`);
