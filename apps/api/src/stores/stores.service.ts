import { StoreModerationDto, StoreModerationPageDto } from './dto/store-moderation.dto';
import { StoreMonetizationDto } from './dto/store-monetization.dto';
import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { CatalogCache } from 'src/infrastructure/catalog-cache';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { QueryStoresDto, StoreSortBy } from './dto/query-stores.dto';
import { Prisma, UserRole, type StoreStatus } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCache,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async create(userId: number, dto: CreateStoreDto) {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.role !== UserRole.store_owner) {
      throw new ForbiddenException('User must be a store owner to create a store');
    }

    this.validateFreeDeliveryThreshold(dto.freeDeliveryThreshold);

    const category = await this.prisma.storeCategory.findUnique({
      where: { categoryId: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Store category not found');
    }

    return this.prisma.store.create({
      data: {
        ...dto,
        ownerId: userId,
        status: 'PENDING_APPROVAL',
      },
      include: {
        storeCategory: true,
      },
    });
  }

  findAll(query: QueryStoresDto) {
    if (!query.search && !query.areaId && !query.categoryId && (query.page ?? 1) === 1 && (query.limit ?? 20) === 20) {
      return this.cache.read(`stores:${query.sortBy ?? StoreSortBy.RATING}`, () => this.queryStores(query));
    }
    return this.queryStores(query);
  }

  private async queryStores(query: QueryStoresDto) {
    const { categoryId, areaId, search, sortBy = StoreSortBy.RATING, page = 1, limit = 20 } = query;

    const where: Prisma.StoreWhereInput = { status: 'ACTIVE' };

    if (categoryId) where.categoryId = categoryId;
    if (areaId) where.areaId = areaId;

    if (search) {
      where.OR = [
        { storeName: { contains: search } },
        { storeNameAr: { contains: search } },
      ];
    }

    let orderBy: Prisma.StoreOrderByWithRelationInput = {};
    switch (sortBy) {
      case StoreSortBy.RATING:
        orderBy = { avgRating: 'desc' };
        break;
      case StoreSortBy.DELIVERY_TIME:
        orderBy = { estimatedPrepMin: 'asc' };
        break;
      case StoreSortBy.NAME_AZ:
        orderBy = { storeNameAr: 'asc' };
        break;
      case StoreSortBy.NEWEST:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const skip = (page - 1) * limit;

    const [stores, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        orderBy: [orderBy, { storeId: 'asc' }],
        include: {
          storeCategory: { select: { nameAr: true, nameEn: true, iconUrl: true } },
          _count: { select: { reviews: true } },
        },
        skip,
        take: limit,
      }),
      this.prisma.store.count({ where }),
    ]);

    return {
      data: stores,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findTopRated(limit: number = 10) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Limit must be between 1 and 100');
    const load = () => this.prisma.store.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ avgRating: 'desc' }, { storeId: 'asc' }],
      take: limit,
      include: {
        storeCategory: { select: { nameAr: true, iconUrl: true } },
      },
    });
    return limit === 10 ? this.cache.read('top-rated', load) : load();
  }

  moderationQueue(query: StoreModerationPageDto) {
    return this.prisma.store.findMany({ where: { status: query.status }, orderBy: { storeId: 'asc' }, ...pageWindow(query) });
  }

  async moderate(actorId: number, storeId: number, dto: StoreModerationDto) {
    if (!allowedModeration[dto.expectedStatus].includes(dto.status)) throw new ConflictException('Invalid store status transition');
    const result = await this.prisma.$transaction(async tx => {
      const change = await tx.store.updateMany({ where: { storeId, status: dto.expectedStatus }, data: { status: dto.status } });
      if (!change.count) {
        if (!await tx.store.findUnique({ where: { storeId }, select: { storeId: true } })) throw new NotFoundException('Store not found');
        throw new ConflictException('Store status changed');
      }
      return tx.storeModerationEvent.create({ data: { storeId, actorId, fromStatus: dto.expectedStatus, toStatus: dto.status, reason: dto.reason.trim() } });
    });
    await this.cache.invalidate();
    return result;
  }

  async updateMonetization(storeId: number, dto: StoreMonetizationDto) {
    try {
      const updated = await this.prisma.store.update({
        where: { storeId },
        data: {
          ...(dto.planTier !== undefined && { planTier: dto.planTier }),
          ...(dto.commissionBps !== undefined && { commissionBps: dto.commissionBps }),
        },
        include: { storeCategory: true },
      });
      await this.cache.invalidate();
      return updated;
    } catch (error) {
      if (error.code === 'P2025') throw new NotFoundException('Store not found');
      throw error;
    }
  }

  async findOne(storeId: number) {
    const store = await this.prisma.store.findUnique({
      where: { storeId, status: 'ACTIVE' },
      include: {
        storeCategory: true,
        productCategories: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { prodCategoryId: 'asc' }],
          take: 12,
          include: {
            products: {
              where: { isAvailable: true },
              orderBy: [{ sortOrder: 'asc' }, { productId: 'asc' }],
              take: 12,
              include: { productOptions: { orderBy: { optionId: 'asc' }, take: 20 } },
            },
          },
        },
        storeImages: { orderBy: [{ sortOrder: 'asc' }, { imageId: 'asc' }], take: 20 },
        reviews: {
          include: {
            user: {
              select: {
                full_name: true,    
                full_name_ar: true, 
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async update(userId: number, storeId: number, dto: UpdateStoreDto) {
    await this.assertOwnership(userId, storeId);
    this.validateFreeDeliveryThreshold(dto.freeDeliveryThreshold);
    const updated = await this.prisma.store.update({
      where: { storeId },
      data: dto,
    });
    await this.cache.invalidate();
    return updated;
  }

  private validateFreeDeliveryThreshold(threshold: number | null | undefined) {
    if (threshold === undefined || threshold === null) return;
    const driverFee = Number(this.config?.get('DRIVER_FEE_ILS') ?? 0);
    if (Number.isFinite(driverFee) && driverFee > 0 && threshold < driverFee) {
      throw new BadRequestException(
        `الحد الأدنى للتوصيل المجاني (${threshold}) يجب أن يكون أكبر من أو يساوي رسوم السائق (${driverFee}).`,
      );
    }
  }

  async toggleStatus(userId: number, storeId: number, isOpenNow: boolean) {
    await this.assertOwnership(userId, storeId);
    const updated = await this.prisma.store.update({ where: { storeId, ownerId: userId }, data: { isOpenNow } });
    await this.cache.invalidate();
    return updated;
  }

  async delete(userId: number, storeId: number) {
    await this.assertOwnership(userId, storeId);
    await this.prisma.$transaction(async tx => {
      const [store] = await tx.$queryRaw<{ status: StoreStatus }[]>`
        SELECT status FROM stores WHERE store_id = ${storeId} AND owner_id = ${userId} FOR UPDATE`;
      if (!store) throw new NotFoundException('Store not found');
      if (store.status === 'INACTIVE') return;
      await tx.store.update({ where: { storeId }, data: { status: 'INACTIVE', isOpenNow: false } });
      await tx.storeModerationEvent.create({
        data: { storeId, actorId: userId, fromStatus: store.status, toStatus: 'INACTIVE', reason: 'Archived by store owner' },
      });
    });
    await this.cache.invalidate();
    return { message: 'Store archived successfully' };
  }

  async findMyStores(userId: number, page = new PageDto()) {
    return this.prisma.store.findMany({
      where: { ownerId: userId },
      ...pageWindow(page), orderBy: { storeId: 'asc' },
      include: { storeCategory: true },
    });
  }
  private async assertOwnership(userId: number, storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { storeId }, select: { ownerId: true, isOpenNow: true } });
    if (!store) throw new NotFoundException('Store not found');
    if (store.ownerId !== userId) throw new ForbiddenException('Store ownership required');
    return store;
  }
}
const allowedModeration: Record<StoreStatus, StoreStatus[]> = {
  PENDING_APPROVAL: ['ACTIVE', 'INACTIVE'],
  ACTIVE: ['SUSPENDED', 'CLOSED_TEMPORARILY', 'INACTIVE'],
  SUSPENDED: ['ACTIVE', 'INACTIVE'],
  CLOSED_TEMPORARILY: ['ACTIVE', 'SUSPENDED', 'INACTIVE'],
  INACTIVE: ['PENDING_APPROVAL'],
};
