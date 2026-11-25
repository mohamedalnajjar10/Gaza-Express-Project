import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function payoutConfig(config: ConfigService) {
  const defaultCommissionBps = Number(config.get('PLATFORM_COMMISSION_BPS', '0'));
  const proDiscountBps = Number(config.get('PRO_COMMISSION_DISCOUNT_BPS', '0'));
  const defaultDriverFee = new Prisma.Decimal(config.get('DRIVER_FEE_ILS', '0'));
  const deliveryCutBps = Number(config.get('DELIVERY_PLATFORM_CUT_BPS', '0'));
  const deliveryBaseFeeIls = config.get('DELIVERY_BASE_FEE_ILS', '0');
  const deliveryPerKmFeeIls = config.get('DELIVERY_PER_KM_FEE_ILS', '0');
  const rawBankPhone = config.get('PLATFORM_BANK_TRANSFER_PHONE', '0592229436');
  const platformBankPhone = (typeof rawBankPhone === 'string' ? rawBankPhone.trim() : '') || '0592229436';
  if (
    !Number.isInteger(defaultCommissionBps) || defaultCommissionBps < 0 || defaultCommissionBps > 5000
    || !Number.isInteger(proDiscountBps) || proDiscountBps < 0 || proDiscountBps > 5000
    || !Number.isInteger(deliveryCutBps) || deliveryCutBps < 0 || deliveryCutBps > 10000
    || !defaultDriverFee.isFinite() || defaultDriverFee.lt(0) || defaultDriverFee.decimalPlaces() > 2
    || !/^0(?:59|56)\d{7}$/.test(platformBankPhone)
  ) {
    throw new ConflictException('Invalid payout configuration');
  }
  return { defaultCommissionBps, proDiscountBps, defaultDriverFee, deliveryCutBps, deliveryBaseFeeIls, deliveryPerKmFeeIls, platformBankPhone };
}

export function resolveCommissionBps(
  store: { planTier: 'FREE' | 'PRO'; commissionBps: number | null; storeCategory: { defaultCommissionBps: number | null } },
  cfg: { defaultCommissionBps: number; proDiscountBps: number },
) {
  if (store.commissionBps !== null) return store.commissionBps;
  const base = store.storeCategory.defaultCommissionBps ?? cfg.defaultCommissionBps;
  return store.planTier === 'PRO' ? Math.max(0, base - cfg.proDiscountBps) : base;
}
