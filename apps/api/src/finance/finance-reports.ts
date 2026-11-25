import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { payoutConfig, resolveCommissionBps } from './payout-config';

type Actor = { user_id: number; role: UserRole };

export async function merchantSummary(db: PrismaService, config: ConfigService, actor: Actor) {
  if (actor.role !== 'store_owner') throw new ForbiddenException('Store owner account required');
  const cfg = payoutConfig(config);
  type MerchantStoreAggRow = {
    storeId: number;
    deliveredCount: bigint | number;
    grossSales: Prisma.Decimal | string | number;
    netEarnings: Prisma.Decimal | string | number;
    platformFees: Prisma.Decimal | string | number;
    deliveryFeesTotal: Prisma.Decimal | string | number;
    pendingStorePayout: Prisma.Decimal | string | number;
    pendingDirectBankHandover: Prisma.Decimal | string | number;
  };
  const [stores, methodCounts, storeAggs, statusCounts] = await Promise.all([
    db.store.findMany({
      where: { ownerId: actor.user_id },
      select: {
        storeId: true, storeName: true, storeNameAr: true, status: true, planTier: true,
        commissionBps: true, deliveryBaseFee: true, deliveryPerKmFee: true, freeDeliveryThreshold: true,
        bankTransferPhone: true,
        storeCategory: { select: { categoryId: true, nameAr: true, defaultCommissionBps: true } },
      },
      orderBy: { storeId: 'asc' },
    }),
    db.payment.groupBy({
      by: ['method'],
      where: { order: { store: { ownerId: actor.user_id } }, status: { notIn: ['VOID', 'REFUNDED'] } },
      _count: { _all: true },
    }),
    db.$queryRaw<MerchantStoreAggRow[]>`
      SELECT
        o.storeId AS storeId,
        COUNT(*) AS deliveredCount,
        COALESCE(SUM(p.amount), 0) AS grossSales,
        COALESCE(SUM(p.storeShare), 0) AS netEarnings,
        COALESCE(SUM(p.platformShare), 0) AS platformFees,
        COALESCE(SUM(p.deliveryFee), 0) AS deliveryFeesTotal,
        COALESCE(SUM(CASE WHEN p.status = 'PAID' AND pe.id IS NULL THEN p.storeShare ELSE 0 END), 0) AS pendingStorePayout,
        COALESCE(SUM(CASE WHEN p.status = 'PAID' AND p.storeCollected = TRUE AND p.cashHandedOverAt IS NULL THEN p.amount ELSE 0 END), 0) AS pendingDirectBankHandover
      FROM payments p
      JOIN customer_orders o ON o.id = p.orderId
      JOIN stores s ON s.store_id = o.storeId
      LEFT JOIN payment_entries pe ON pe.orderId = p.orderId AND pe.kind = 'store_payout'
      WHERE s.owner_id = ${actor.user_id}
        AND p.status NOT IN ('VOID', 'REFUNDED')
        AND o.status = 'DELIVERED'
      GROUP BY o.storeId`,
    db.customerOrder.groupBy({
      by: ['status'],
      where: { store: { ownerId: actor.user_id } },
      _count: { _all: true },
    }),
  ]);

  const zero = () => new Prisma.Decimal(0);
  const dec = (value: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(value ?? 0);
  let grossSales = zero();
  let netStoreEarnings = zero();
  let platformFees = zero();
  let deliveryFeesTotal = zero();
  let pendingStorePayout = zero();
  let pendingDirectBankHandover = zero();
  let deliveredOrders = 0;

  const perStore = new Map<number, { deliveredCount: number; grossSales: Prisma.Decimal; netEarnings: Prisma.Decimal; platformFees: Prisma.Decimal }>();
  for (const row of storeAggs) {
    const storeId = Number(row.storeId);
    const count = Number(row.deliveredCount);
    const rowGross = dec(row.grossSales);
    const rowNet = dec(row.netEarnings);
    const rowPlatform = dec(row.platformFees);
    deliveredOrders += count;
    grossSales = grossSales.plus(rowGross);
    netStoreEarnings = netStoreEarnings.plus(rowNet);
    platformFees = platformFees.plus(rowPlatform);
    deliveryFeesTotal = deliveryFeesTotal.plus(dec(row.deliveryFeesTotal));
    pendingStorePayout = pendingStorePayout.plus(dec(row.pendingStorePayout));
    pendingDirectBankHandover = pendingDirectBankHandover.plus(dec(row.pendingDirectBankHandover));
    perStore.set(storeId, {
      deliveredCount: count,
      grossSales: rowGross,
      netEarnings: rowNet,
      platformFees: rowPlatform,
    });
  }

  const bankTransferOrders = methodCounts.find(m => m.method === 'BANK_TRANSFER')?._count._all ?? 0;
  const cashOrders = methodCounts.find(m => m.method === 'CASH')?._count._all ?? 0;
  const totalOrders = statusCounts.reduce((acc, row) => acc + row._count._all, 0);
  return {
    totals: {
      totalOrders,
      deliveredOrders,
      bankTransferOrders,
      cashOrders,
      grossSales: grossSales.toFixed(2),
      netStoreEarnings: netStoreEarnings.toFixed(2),
      platformFees: platformFees.toFixed(2),
      deliveryFeesTotal: deliveryFeesTotal.toFixed(2),
      pendingStorePayout: pendingStorePayout.toFixed(2),
      pendingDirectBankHandover: pendingDirectBankHandover.toFixed(2),
    },
    config: {
      defaultCommissionBps: cfg.defaultCommissionBps,
      proCommissionDiscountBps: cfg.proDiscountBps,
      bankTransferPointsPerOrder: 20,
      cashPointsPerOrder: 10,
      platformBankPhone: cfg.platformBankPhone,
    },
    stores: stores.map(store => {
      const stats = perStore.get(store.storeId);
      return {
        storeId: store.storeId,
        storeName: store.storeName,
        storeNameAr: store.storeNameAr,
        status: store.status,
        planTier: store.planTier,
        commissionBps: store.commissionBps,
        categoryNameAr: store.storeCategory.nameAr,
        categoryDefaultCommissionBps: store.storeCategory.defaultCommissionBps,
        effectiveCommissionBps: resolveCommissionBps(store, cfg),
        deliveryBaseFee: store.deliveryBaseFee?.toString() ?? null,
        deliveryPerKmFee: store.deliveryPerKmFee?.toString() ?? null,
        freeDeliveryThreshold: store.freeDeliveryThreshold?.toString() ?? null,
        bankTransferPhone: store.bankTransferPhone,
        deliveredOrders: stats?.deliveredCount ?? 0,
        grossSales: (stats?.grossSales ?? zero()).toFixed(2),
        netEarnings: (stats?.netEarnings ?? zero()).toFixed(2),
        platformFees: (stats?.platformFees ?? zero()).toFixed(2),
      };
    }),
  };
}

export async function platformSummary(db: PrismaService, config: ConfigService, actor: Actor) {
  if (actor.role !== 'admin') throw new ForbiddenException('Admin account required');
  const cfg = payoutConfig(config);
  type PlatformAggRow = {
    deliveredOrders: bigint | number;
    grossMerchandiseValue: Prisma.Decimal | string | number;
    totalDeliveryFees: Prisma.Decimal | string | number;
    totalPlatformRevenue: Prisma.Decimal | string | number;
    totalStorePayouts: Prisma.Decimal | string | number;
    totalDriverPayouts: Prisma.Decimal | string | number;
    totalCompanyFees: Prisma.Decimal | string | number;
    pendingSettlementOrders: bigint | number;
  };
  type PendingSettlementRow = {
    orderId: bigint | number;
    storeNameAr: string;
    amount: Prisma.Decimal | string | number;
    method: PaymentMethod;
    needsHandover: bigint | number | boolean;
    needsStorePayout: bigint | number | boolean;
    needsDriverPayout: bigint | number | boolean;
  };
  const [categories, stores, methodCounts, activeOrders, [deliveredAgg], pendingSettlementRows] = await Promise.all([
    db.storeCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { categoryId: 'asc' }],
      select: {
        categoryId: true, nameAr: true, nameEn: true, defaultCommissionBps: true, isActive: true,
        _count: { select: { stores: true } },
      },
    }),
    db.store.findMany({
      orderBy: { storeId: 'asc' },
      select: {
        storeId: true, storeName: true, storeNameAr: true, status: true, planTier: true,
        commissionBps: true, deliveryBaseFee: true, deliveryPerKmFee: true, freeDeliveryThreshold: true,
        totalOrders: true,
        storeCategory: { select: { categoryId: true, nameAr: true, defaultCommissionBps: true } },
      },
    }),
    db.payment.groupBy({
      by: ['method'],
      where: { status: { notIn: ['VOID', 'REFUNDED'] } },
      _count: { _all: true },
    }),
    db.payment.count({
      where: {
        status: { notIn: ['VOID', 'REFUNDED'] },
        order: { status: { notIn: ['DELIVERED', 'CANCELLED', 'REJECTED'] } },
      },
    }),
    db.$queryRaw<PlatformAggRow[]>`
      SELECT
        COUNT(*) AS deliveredOrders,
        COALESCE(SUM(p.amount), 0) AS grossMerchandiseValue,
        COALESCE(SUM(p.deliveryFee), 0) AS totalDeliveryFees,
        COALESCE(SUM(p.platformShare), 0) AS totalPlatformRevenue,
        COALESCE(SUM(p.storeShare), 0) AS totalStorePayouts,
        COALESCE(SUM(p.driverShare), 0) AS totalDriverPayouts,
        COALESCE(SUM(p.companyFeeApplied), 0) AS totalCompanyFees,
        COALESCE(SUM(CASE WHEN p.status = 'PAID' AND (
          ((p.method = 'CASH' OR p.storeCollected = TRUE) AND p.cashHandedOverAt IS NULL)
          OR (p.storeShare > 0 AND pe_store.id IS NULL)
          OR (p.driverShare > 0 AND pe_driver.id IS NULL)
        ) THEN 1 ELSE 0 END), 0) AS pendingSettlementOrders
      FROM payments p
      JOIN customer_orders o ON o.id = p.orderId
      LEFT JOIN payment_entries pe_store ON pe_store.orderId = p.orderId AND pe_store.kind = 'store_payout'
      LEFT JOIN payment_entries pe_driver ON pe_driver.orderId = p.orderId AND pe_driver.kind = 'driver_payout'
      WHERE p.status NOT IN ('VOID', 'REFUNDED')
        AND o.status = 'DELIVERED'`,
    db.$queryRaw<PendingSettlementRow[]>`
      SELECT
        p.orderId AS orderId,
        COALESCE(s.store_name_ar, o.storeName) AS storeNameAr,
        p.amount AS amount,
        p.method AS method,
        ((p.method = 'CASH' OR p.storeCollected = TRUE) AND p.cashHandedOverAt IS NULL) AS needsHandover,
        (p.storeShare > 0 AND pe_store.id IS NULL) AS needsStorePayout,
        (p.driverShare > 0 AND pe_driver.id IS NULL) AS needsDriverPayout
      FROM payments p
      JOIN customer_orders o ON o.id = p.orderId
      JOIN stores s ON s.store_id = o.storeId
      LEFT JOIN payment_entries pe_store ON pe_store.orderId = p.orderId AND pe_store.kind = 'store_payout'
      LEFT JOIN payment_entries pe_driver ON pe_driver.orderId = p.orderId AND pe_driver.kind = 'driver_payout'
      WHERE p.status = 'PAID'
        AND o.status = 'DELIVERED'
        AND (
          ((p.method = 'CASH' OR p.storeCollected = TRUE) AND p.cashHandedOverAt IS NULL)
          OR (p.storeShare > 0 AND pe_store.id IS NULL)
          OR (p.driverShare > 0 AND pe_driver.id IS NULL)
        )
      ORDER BY p.orderId DESC
      LIMIT 25`,
  ]);

  const dec = (value: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(value ?? 0);
  const bankTransferOrders = methodCounts.find(m => m.method === 'BANK_TRANSFER')?._count._all ?? 0;
  const cashOrders = methodCounts.find(m => m.method === 'CASH')?._count._all ?? 0;

  return {
    config: {
      defaultCommissionBps: cfg.defaultCommissionBps,
      proCommissionDiscountBps: cfg.proDiscountBps,
      deliveryBaseFeeIls: cfg.deliveryBaseFeeIls,
      deliveryPerKmFeeIls: cfg.deliveryPerKmFeeIls,
      deliveryPlatformCutBps: cfg.deliveryCutBps,
      driverFeeIls: cfg.defaultDriverFee.toString(),
      platformBankPhone: cfg.platformBankPhone,
    },
    totals: {
      totalStores: stores.length,
      activeStores: stores.filter(s => s.status === 'ACTIVE').length,
      proStores: stores.filter(s => s.planTier === 'PRO').length,
      freeStores: stores.filter(s => s.planTier === 'FREE').length,
      deliveredOrders: Number(deliveredAgg?.deliveredOrders ?? 0),
      activeOrders,
      bankTransferOrders,
      cashOrders,
      pendingSettlementOrders: Number(deliveredAgg?.pendingSettlementOrders ?? 0),
      grossMerchandiseValue: dec(deliveredAgg?.grossMerchandiseValue).toFixed(2),
      totalDeliveryFees: dec(deliveredAgg?.totalDeliveryFees).toFixed(2),
      totalPlatformRevenue: dec(deliveredAgg?.totalPlatformRevenue).toFixed(2),
      totalStorePayouts: dec(deliveredAgg?.totalStorePayouts).toFixed(2),
      totalDriverPayouts: dec(deliveredAgg?.totalDriverPayouts).toFixed(2),
      totalCompanyFees: dec(deliveredAgg?.totalCompanyFees).toFixed(2),
    },
    pendingSettlementOrdersList: pendingSettlementRows.map(row => ({
      orderId: Number(row.orderId),
      storeNameAr: row.storeNameAr,
      amount: dec(row.amount).toFixed(2),
      method: row.method,
      needsHandover: Boolean(Number(row.needsHandover)),
      needsStorePayout: Boolean(Number(row.needsStorePayout)),
      needsDriverPayout: Boolean(Number(row.needsDriverPayout)),
    })),
    categories: categories.map(c => ({
      categoryId: c.categoryId,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      defaultCommissionBps: c.defaultCommissionBps,
      isActive: c.isActive,
      storeCount: c._count.stores,
    })),
    stores: stores.map(store => ({
      storeId: store.storeId,
      storeName: store.storeName,
      storeNameAr: store.storeNameAr,
      status: store.status,
      planTier: store.planTier,
      commissionBps: store.commissionBps,
      categoryId: store.storeCategory.categoryId,
      categoryNameAr: store.storeCategory.nameAr,
      categoryDefaultCommissionBps: store.storeCategory.defaultCommissionBps,
      effectiveCommissionBps: resolveCommissionBps(store, cfg),
      deliveryBaseFee: store.deliveryBaseFee?.toString() ?? null,
      deliveryPerKmFee: store.deliveryPerKmFee?.toString() ?? null,
      freeDeliveryThreshold: store.freeDeliveryThreshold?.toString() ?? null,
      totalOrders: store.totalOrders,
    })),
  };
}
