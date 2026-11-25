ALTER TABLE stores ADD bankTransferPhone VARCHAR(10) NULL;
ALTER TABLE payments ADD recipientPhone VARCHAR(10) NULL, ADD storeCollected BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE bank_receipts (
 orderId INT PRIMARY KEY, image MEDIUMBLOB NOT NULL, submittedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 reportReason VARCHAR(500), reportedBy INT, reviewedBy INT, decision VARCHAR(12),
 CONSTRAINT bank_receipt_payment_fk FOREIGN KEY (orderId) REFERENCES payments(orderId) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
