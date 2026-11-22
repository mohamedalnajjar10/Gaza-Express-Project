import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { DeliveryCompanyDto, DriverLocationDto } from './orders.dto';

type Actor = { user_id: number; role: UserRole };
type Queryable = Pick<Prisma.TransactionClient, '$queryRaw'>;
type Offer = {
  id: number;
  storeId: number;
  storeName: string;
  status: string;
  version: number;
  createdAt: Date;
  pickupKm: number | null;
  nearby: number | bigint | boolean | null;
  canClaim: number | bigint | boolean;
};

const locationLifetimeMs = 2 * 60_000;
const priorityMs = 45_000;
const merchantAccount = { role: 'store_owner', is_active: true, is_verified: true } as const;
const driverAccount = { role: 'driver', is_active: true, is_verified: true } as const;

function distance(lat: Prisma.Sql, lng: Prisma.Sql, toLat: Prisma.Sql, toLng: Prisma.Sql) {
  return Prisma.sql`(12742 * ASIN(SQRT(LEAST(1, GREATEST(0,
    POW(SIN(RADIANS(${toLat} - ${lat}) / 2), 2) +
    COS(RADIANS(${lat})) * COS(RADIANS(${toLat})) * POW(SIN(RADIANS(${toLng} - ${lng}) / 2), 2)
  )))))`;
}

function distances(lat: Prisma.Sql, lng: Prisma.Sql) {
  const pickup = distance(lat, lng, Prisma.sql`s.latitude`, Prisma.sql`s.longitude`);
  const dropoff = distance(lat, lng,
    Prisma.sql`JSON_VALUE(o.addressSnapshot, '$.latitude' RETURNING DECIMAL(10,8))`,
    Prisma.sql`JSON_VALUE(o.addressSnapshot, '$.longitude' RETURNING DECIMAL(11,8))`);
  return { pickup, score: Prisma.sql`(0.7 * ${pickup} + 0.3 * COALESCE(${dropoff}, ${pickup}))` };
}

const companyOrder: Prisma.CustomerOrderWhereInput = {
  dispatchOpenedAt: { not: null },
  status: { in: ['ACCEPTED', 'READY'] },
  driverId: null,
};

@Injectable()
export class DispatchService {
  constructor(private readonly db: PrismaService) {}

  async canSeeIndependentOffers(actor: Actor) {
    return actor.role === 'driver' && !!await this.db.driverProfile.findFirst({
      where: { userId: actor.user_id, approved: true, available: true, deliveryCompanyId: null },
      select: { userId: true },
    });
  }

  async independentOffers(actor: Actor, id?: number, db: Queryable = this.db) {
    if (actor.role !== 'driver') throw new ForbiddenException();
    const now = new Date();
    const stale = new Date(now.getTime() - locationLifetimeMs);
    const fresh = Prisma.sql`(d.locationUpdatedAt IS NOT NULL AND d.locationUpdatedAt >= ${stale})`;
    const { pickup, score } = distances(Prisma.sql`d.latitude`, Prisma.sql`d.longitude`);
    const closest = distances(Prisma.sql`candidate.latitude`, Prisma.sql`candidate.longitude`).score;
    const rows = await db.$queryRaw<Offer[]>`
      SELECT o.id, o.storeId, COALESCE(s.store_name_ar, o.storeName) AS storeName, o.status, o.version, o.createdAt,
        CASE WHEN ${fresh} THEN ROUND(${pickup}, 1) END AS pickupKm,
        CASE WHEN ${fresh} THEN (${score} <= 3) ELSE d.dispatchAreaId = s.area_id END AS nearby,
        CASE WHEN o.dispatchOpenedAt <= ${new Date(now.getTime() - priorityMs)}
          OR s.latitude IS NULL OR s.longitude IS NULL THEN 1
          ELSE COALESCE(d.userId = (
            SELECT candidate.userId FROM driver_profiles candidate
            JOIN users u ON u.user_id = candidate.userId
            LEFT JOIN customer_orders busy ON busy.activeDriverId = candidate.userId
            WHERE candidate.deliveryCompanyId IS NULL AND candidate.approved = TRUE AND candidate.available = TRUE
              AND candidate.locationUpdatedAt >= ${stale}
              AND u.role = 'driver' AND u.is_active = TRUE AND u.is_verified = TRUE AND busy.id IS NULL
            ORDER BY ${closest}, candidate.userId LIMIT 1
          ), NOT ${fresh})
        END AS canClaim
      FROM customer_orders o
      JOIN stores s ON s.store_id = o.storeId
      JOIN driver_profiles d ON d.userId = ${actor.user_id}
      JOIN users u ON u.user_id = d.userId
      LEFT JOIN customer_orders active ON active.activeDriverId = d.userId
      WHERE o.deliveryCompanyId IS NULL AND o.driverId IS NULL AND o.status IN ('ACCEPTED', 'READY')
        AND o.dispatchOpenedAt IS NOT NULL AND (o.offerExpiresAt IS NULL OR o.offerExpiresAt <= ${now})
        AND d.deliveryCompanyId IS NULL AND d.approved = TRUE AND d.available = TRUE
        AND u.role = 'driver' AND u.is_active = TRUE AND u.is_verified = TRUE
        AND (${fresh} OR d.dispatchAreaId = s.area_id) AND active.id IS NULL
        ${id === undefined ? Prisma.empty : Prisma.sql`AND o.id = ${id}`}
      ORDER BY canClaim DESC, (s.latitude IS NULL OR s.longitude IS NULL), CASE WHEN ${fresh} THEN ${score} END, o.id DESC
      LIMIT 50`;

    return rows.map(({ pickupKm, nearby, canClaim, ...order }) => ({
      ...order, offerOnly: true as const,
      openOffer: { pickupKm: pickupKm === null ? null : Number(pickupKm), nearby: Boolean(nearby), canClaim: Boolean(canClaim) },
    }));
  }

  async updateLocation(actor: Actor, point?: DriverLocationDto) {
    if (actor.role !== 'driver') throw new ForbiddenException();
    const result = await this.db.driverProfile.updateMany({
      where: {
        userId: actor.user_id,
        ...(point && { approved: true, user: { ...driverAccount } }),
      },
      data: point ? { ...point, locationUpdatedAt: new Date() } : { latitude: null, longitude: null, locationUpdatedAt: null },
    });
    if (point && !result.count) throw new ForbiddenException('Driver approval required');
  }

  async tracking(actor: Actor, id: number) {
    if (actor.role !== 'store_owner') throw new ForbiddenException();
    const order = await this.db.customerOrder.findFirst({
      where: { id, store: { ownerId: actor.user_id } },
      select: { status: true, driver: { select: {
        full_name: true, full_name_ar: true, phone: true,
        driverProfile: { select: { latitude: true, longitude: true, locationUpdatedAt: true, approved: true, user: { select: { is_active: true, is_verified: true, role: true } } } },
      } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driver || !['ACCEPTED', 'ASSIGNED', 'IN_TRANSIT'].includes(order.status)) return { driver: null };
    const { driverProfile: position, ...identity } = order.driver;
    const updatedAt = position?.locationUpdatedAt;
    const fresh = updatedAt && updatedAt.getTime() >= Date.now() - locationLifetimeMs;
    const enabled = position?.approved && position.user.is_active && position.user.is_verified && position.user.role === 'driver';
    const location = enabled && fresh && position.latitude !== null && position.longitude !== null
      ? { latitude: +position.latitude, longitude: +position.longitude, updatedAt }
      : null;
    return { driver: { name: identity.full_name_ar || identity.full_name, phone: identity.phone, location } };
  }

  async companyQueue(actor: Actor) {
    if (actor.role !== 'store_owner') throw new ForbiddenException();
    const company = await this.db.deliveryCompany.findFirst({
      where: { managerId: actor.user_id, manager: merchantAccount },
      select: { id: true, name: true },
    });
    if (!company) return null;
    const [orders, drivers, requests] = await Promise.all([
      this.db.customerOrder.findMany({
        where: { ...companyOrder, deliveryCompanyId: company.id },
        select: { id: true, version: true, storeName: true, status: true },
        orderBy: { dispatchOpenedAt: 'asc' }, take: 50,
      }),
      this.db.driverProfile.findMany({
        where: {
          deliveryCompanyId: company.id, approved: true, available: true,
          user: { ...driverAccount, assignedOrders: { none: { status: { in: ['ACCEPTED', 'ASSIGNED', 'IN_TRANSIT'] } } } },
        },
        select: { userId: true, user: { select: { full_name: true, full_name_ar: true } } },
        orderBy: { userId: 'asc' },
      }),
      this.db.storeDeliveryContract.findMany({
        where: { deliveryCompanyId: company.id, confirmed: false },
        select: { store: { select: { storeId: true, storeName: true, storeNameAr: true } } },
        orderBy: { storeId: 'asc' }, take: 50,
      }),
    ]);
    return {
      company, orders, drivers: drivers.map(({ userId, user }) => ({ userId, name: user.full_name_ar || user.full_name })),
      requests: requests.map(({ store }) => ({ storeId: store.storeId, name: store.storeNameAr || store.storeName })),
    };
  }

  async partnersForStore(actor: Actor, storeId: number) {
    await this.assertStoreOwner(actor, storeId);
    const companies = await this.db.deliveryCompany.findMany({
      where: { manager: merchantAccount },
      select: { id: true, name: true, contracts: { where: { storeId }, select: { confirmed: true } } },
      orderBy: { name: 'asc' },
    });
    return companies.map(({ contracts, ...company }) => ({
      ...company, contract: contracts[0] ? (contracts[0].confirmed ? 'CONFIRMED' : 'PENDING') : null,
    }));
  }

  async requestContract(actor: Actor, storeId: number, deliveryCompanyId: number) {
    await this.assertStoreOwner(actor, storeId);
    const company = await this.db.deliveryCompany.findFirst({ where: { id: deliveryCompanyId, manager: merchantAccount }, select: { id: true } });
    if (!company) throw new NotFoundException('Delivery company not found');
    await this.db.storeDeliveryContract.createMany({ data: [{ storeId, deliveryCompanyId }], skipDuplicates: true });
  }

  async confirmContract(actor: Actor, storeId: number, deliveryCompanyId: number) {
    if (actor.role !== 'store_owner') throw new ForbiddenException();
    const updated = await this.db.storeDeliveryContract.updateMany({
      where: { storeId, deliveryCompanyId, deliveryCompany: { managerId: actor.user_id, manager: merchantAccount } },
      data: { confirmed: true },
    });
    if (!updated.count) throw new NotFoundException('Contract not found');
  }

  private async assertStoreOwner(actor: Actor, storeId: number) {
    if (actor.role !== 'store_owner') throw new ForbiddenException();
    const store = await this.db.store.findFirst({ where: { storeId, ownerId: actor.user_id }, select: { storeId: true } });
    if (!store) throw new NotFoundException('Store not found');
  }

  listCompanies(actor: Actor) {
    this.admin(actor);
    return this.db.deliveryCompany.findMany({
      select: { id: true, name: true, managerId: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCompany(actor: Actor, dto: DeliveryCompanyDto) {
    this.admin(actor);
    const manager = await this.db.user.findFirst({ where: { user_id: dto.managerId, ...merchantAccount }, select: { user_id: true } });
    if (!manager) throw new NotFoundException('An active verified business account is required');
    try {
      return await this.db.deliveryCompany.create({ data: { name: dto.name.trim(), managerId: manager.user_id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This account already manages a delivery company');
      throw error;
    }
  }

  async addContract(actor: Actor, storeId: number, deliveryCompanyId: number) {
    this.admin(actor);
    const [store, company] = await Promise.all([
      this.db.store.findUnique({ where: { storeId }, select: { storeId: true } }),
      this.db.deliveryCompany.findUnique({ where: { id: deliveryCompanyId }, select: { id: true } }),
    ]);
    if (!store || !company) throw new NotFoundException('Store or delivery company not found');
    const key = { storeId, deliveryCompanyId };
    await this.db.storeDeliveryContract.upsert({
      where: { storeId_deliveryCompanyId: key },
      create: { ...key, confirmed: true },
      update: { confirmed: true },
    });
  }

  async linkDriver(actor: Actor, userId: number, deliveryCompanyId: number | null) {
    this.admin(actor);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${userId} FOR UPDATE`;
      const profile = await tx.driverProfile.findFirst({ where: { userId, approved: true, user: driverAccount } });
      if (!profile) throw new NotFoundException('Approved driver not found');
      if (profile.deliveryCompanyId === deliveryCompanyId) return;
      if (await tx.customerOrder.findUnique({ where: { activeDriverId: userId }, select: { id: true } })) {
        throw new ConflictException('Driver already has an active delivery');
      }
      if (deliveryCompanyId !== null && !await tx.deliveryCompany.findUnique({ where: { id: deliveryCompanyId }, select: { id: true } })) {
        throw new NotFoundException('Delivery company not found');
      }
      await tx.driverProfile.update({ where: { userId }, data: { deliveryCompanyId } });
    });
  }

  private admin(actor: Actor) {
    if (actor.role !== 'admin') throw new ForbiddenException();
  }
}
