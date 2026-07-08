import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { QueryStoresDto, StoreSortBy } from './dto/query-stores.dto';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) { }

  async create(userId: number, dto: CreateStoreDto) {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.role !== UserRole.store_owner) {
      throw new BadRequestException('User must be a store owner to create a store');
    }

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

  async findAll(query: QueryStoresDto) {
    const { categoryId, areaId, search, sortBy = StoreSortBy.RATING, page = 1, limit = 20 } = query;

    const where: any = {};

    if (categoryId) where.categoryId = categoryId;
    if (areaId) where.areaId = areaId;

    if (search) {
      where.OR = [
        { storeName: { contains: search } },
        { storeNameAr: { contains: search } },
      ];
    }

    let orderBy: any = {};
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
        orderBy,
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
    return this.prisma.store.findMany({
      orderBy: { avgRating: 'desc' },
      take: limit,
      include: {
        storeCategory: { select: { nameAr: true, iconUrl: true } },
      },
    });
  }

  async findOne(storeId: number) {
    const store = await this.prisma.store.findUnique({
      where: { storeId },
      include: {
        storeCategory: true,
        productCategories: {
          where: { isActive: true },
          include: {
            products: {
              where: { isAvailable: true },
              include: { productOptions: true },
            },
          },
        },
        storeImages: { orderBy: { sortOrder: 'asc' } },
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

  async update(storeId: number, dto: Partial<CreateStoreDto>) {
    await this.findOne(storeId);
    return this.prisma.store.update({
      where: { storeId },
      data: dto,
    });
  }

  async toggleStatus(storeId: number) {
    const store = await this.findOne(storeId);
    const newStatus = store.isOpenNow ? false : true;
    return this.prisma.store.update({
      where: { storeId },
      data: { isOpenNow: newStatus },
    });
  }

  async delete(storeId: number) {
    await this.findOne(storeId);
    await this.prisma.store.delete({ where: { storeId } });
    return { message: 'Store has been deleted successfully' };
  }


  async findMyStores(userId: number) {
    return this.prisma.store.findMany({
      where: { ownerId: userId },
      include: { storeCategory: true },
    });
  }
}