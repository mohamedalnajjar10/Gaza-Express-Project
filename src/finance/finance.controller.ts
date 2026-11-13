import {
  Body, Controller, ForbiddenException, Get, Header, Headers, HttpCode, NotFoundException,
  Param, ParseIntPipe, Patch, Post, Query, Req, Res, UseGuards, type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserRole } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BankReconciliationDto, DriverApprovalDto, DriverAvailabilityDto, SettlementDto } from './finance.dto';
import { FinanceService } from './finance.service';

type AuthRequest = { user: { user_id: number; role: UserRole } };

@Controller()
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Patch('drivers/:id/approval')
  approve(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: DriverApprovalDto) {
    return this.finance.setDriverApproval(req.user, id, dto.approved);
  }

  @Patch('drivers/me/availability')
  availability(@Req() req: AuthRequest, @Body() dto: DriverAvailabilityDto) {
    return this.finance.setAvailability(req.user, dto.available);
  }

  @Get('orders/:id/payment')
  status(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.finance.status(req.user, id);
  }

  @Post('orders/:id/payment/bank-reconciliation')
  @HttpCode(200)
  reconcile(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: BankReconciliationDto) {
    return this.finance.reconcileBank(req.user, id, dto.amount, dto.currency, dto.reference);
  }

  @Post('orders/:id/settlements')
  @HttpCode(200)
  settle(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: SettlementDto) {
    return this.finance.settle(req.user, id, dto.kind, dto.reference);
  }
}

@Controller('webhooks')
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
