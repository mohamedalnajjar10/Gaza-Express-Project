import { Module } from '@nestjs/common';
import { BankReceiptsService } from './bank-receipts.service';
import { FinanceController, FinanceWebhookController } from './finance.controller';
import { FinanceService } from './finance.service';
import { ReceiptVerificationService } from './receipt-verification.service';

@Module({
  controllers: [FinanceController, FinanceWebhookController],
  providers: [FinanceService, BankReceiptsService, ReceiptVerificationService],
  exports: [FinanceService],
})
export class FinanceModule {}
