import { BankReceiptsService } from './bank-receipts.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_UPLOAD_LIMIT } from '../infrastructure/s3-image-storage';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import {
  Body, Controller, ForbiddenException, Get, Header, Headers, HttpCode, NotFoundException,
  StreamableFile, UploadedFile, UseInterceptors, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UseGuards, type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminReceiptQueueDto, ReceiptReportDto, ReceiptDecisionDto, BankReconciliationDto, DriverApprovalDto, DriverAvailabilityDto, SettlementDto, UploadReceiptDto } from './finance.dto';
import { FinanceService } from './finance.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService, private readonly receipts: BankReceiptsService) {}

  @Get('finance/receipt-reports')
  @Roles('admin')
  @Header('Cache-Control', 'private, no-store')
  receiptReports(@Req() req: AuthenticatedRequest, @Query() query: AdminReceiptQueueDto) {
    return this.receipts.adminQueue(req.user, query);
  }

  @Get('finance/merchant-summary')
  @Roles('store_owner')
  @Header('Cache-Control', 'private, no-store')
  merchantSummary(@Req() req: AuthenticatedRequest) {
    return this.finance.merchantSummary(req.user);
  }

  @Get('finance/platform-summary')
  @Roles('admin')
  @Header('Cache-Control', 'private, no-store')
  platformSummary(@Req() req: AuthenticatedRequest) {
    return this.finance.platformSummary(req.user);
  }

  @Post('orders/:id/payment/receipt')
  @Roles('customer')
  @UseInterceptors(FileInterceptor('image', { limits: { files: 1, fields: 5, fileSize: IMAGE_UPLOAD_LIMIT } }))
  uploadReceipt(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() dto: UploadReceiptDto,
  ) {
    return this.receipts.upload(req.user, id, file?.buffer, dto);
  }

  @Get('orders/:id/payment/receipt')
  @Roles('customer', 'store_owner', 'admin')
  @Header('Cache-Control', 'private, no-store')
  async receipt(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return new StreamableFile(await this.receipts.read(req.user, id), { type: 'image/webp' });
  }

  @Post('orders/:id/payment/receipt/report')
  @Roles('store_owner', 'admin')
  report(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ReceiptReportDto) {
    return this.receipts.report(req.user, id, dto.reason);
  }

  @Post('orders/:id/payment/receipt/review')
  @Roles('admin')
  review(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ReceiptDecisionDto) {
    return this.receipts.review(req.user, id, dto.decision, dto.note);
  }

  @Patch('drivers/:id/approval')
  @Roles('admin')
  approve(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: DriverApprovalDto) {
    return this.finance.setDriverApproval(req.user, id, dto.approved);
  }

  @Get('drivers/me/availability')
  @Roles('driver')
  driverAvailability(@Req() req: AuthenticatedRequest) { return this.finance.driverAvailability(req.user); }

  @Patch('drivers/me/availability')
  @Roles('driver')
  availability(@Req() req: AuthenticatedRequest, @Body() dto: DriverAvailabilityDto) {
    return this.finance.setAvailability(req.user, dto);
  }

  @Get('orders/:id/payment')
  @Roles('customer', 'store_owner', 'admin')
  status(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.finance.status(req.user, id);
  }

  @Post('orders/:id/payment/bank-reconciliation')
  @Roles('admin', 'store_owner')
  @HttpCode(200)
  reconcile(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: BankReconciliationDto) {
    return this.finance.reconcileBank(req.user, id, dto.amount, dto.currency, dto.reference);
  }

  @Post('orders/:id/payment/refund')
  @Roles('admin')
  @HttpCode(200)
  refund(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: BankReconciliationDto) {
    return this.finance.recordRefund(req.user, id, dto.amount, dto.currency, dto.reference);
  }

  @Post('orders/:id/settlements')
  @Roles('admin')
  @HttpCode(200)
  settle(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: SettlementDto) {
    return this.finance.settle(req.user, id, dto.kind, dto.reference);
  }
}

@Controller('webhooks')
@Public()
@SkipThrottle({ default: true, auth: true })
export class FinanceWebhookController {
  constructor(private readonly finance: FinanceService, private readonly config: ConfigService) {}

  @Get('whatsapp')
  @Header('Content-Type', 'text/plain')
  verifyWhatsApp(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() response: Response) {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!expected || token !== expected || mode !== 'subscribe' || !/^\d+$/.test(challenge ?? '')) throw new ForbiddenException();
    response.type('text/plain').send(challenge);
  }

  @Post('whatsapp')
  @HttpCode(200)
  async receiveWhatsApp(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') signature: string) {
    this.verify(req.rawBody, signature, this.config.get('WHATSAPP_APP_SECRET'));
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    for (const entry of req.body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (!phoneNumberId || change.field !== 'messages' || change.value?.metadata?.phone_number_id !== phoneNumberId) continue;
        for (const message of change.value.messages ?? []) {
          if (message.type !== 'text' || typeof message.text?.body !== 'string' || typeof message.id !== 'string' || message.id.length > 191) continue;
          const code = /^WASLA ([a-f0-9-]{36})$/i.exec(message.text.body.trim())?.[1];
          if (code) await this.finance.acknowledgeWhatsApp(code.toLowerCase(), message.id);
        }
      }
    }
    return { received: true };
  }

  @Post('payment-sandbox/:id')
  @HttpCode(200)
  sandbox(@Param('id', ParseIntPipe) id: number, @Req() req: RawBodyRequest<Request>, @Headers('x-sandbox-signature') signature: string, @Body() dto: BankReconciliationDto) {
    if (!this.finance.sandboxEnabled()) throw new NotFoundException();
    // Bind the order ID to the signed payload and reject path substitution.
    this.verify(req.rawBody, signature, this.config.get('PAYMENT_SANDBOX_SECRET'), `${id}.`);
    return this.finance.confirmIncoming(id, 'ELECTRONIC', dto.amount, dto.currency, dto.reference, 0);
  }

  private verify(raw: Buffer | undefined, signature: string | undefined, secret: string | undefined, prefix = '') {
    if (!raw || !secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) throw new ForbiddenException();
    const expected = createHmac('sha256', secret).update(prefix).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new ForbiddenException();
  }
}
