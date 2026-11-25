import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './dto/create-product-category.dto';
import { PrismaService } from 'prisma/prisma.service';

type Actor = { user_id: number; role: UserRole };

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(actor: Actor | number, dto: CreateProductCategoryDto) {
    const store = await this.prisma.store.findUnique({
      where: { storeId: dto.storeId },
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    await this.assertOwnership(actor, dto.storeId);
    if (dto.parentId != null) {
      const parent = await this.prisma.productCategory.findFirst({
        where: { prodCategoryId: dto.parentId, storeId: dto.storeId, parentId: null, isActive: true },
      });
      if (!parent) throw new BadRequestException('اختر قسمًا رئيسيًا من المتجر نفسه.');
    }
    return this.prisma.productCategory.create({ data: dto });
  }

  async findAll(storeId?: number, page = new PageDto(), actor?: Actor) {
    const where: Prisma.ProductCategoryWhereInput = { isActive: true };
    if (storeId) where.storeId = storeId;
    if (actor?.role === 'admin') {
      // Admin can inspect categories across all store statuses
    } else if (actor?.role === 'store_owner') {
      where.OR = [{ store: { status: 'ACTIVE' } }, { store: { ownerId: actor.user_id } }];
    } else {
      where.store = { status: 'ACTIVE' };
    }
    return this.prisma.productCategory.findMany({
      ...pageWindow(page),
      where,
      orderBy: [{ sortOrder: 'asc' }, { prodCategoryId: 'asc' }],
    });
  }

  async findOne(id: number, actor?: Actor) {
    const category = await this.prisma.productCategory.findUnique({
      where: { prodCategoryId: id },
      include: { store: { select: { status: true, ownerId: true } } },
    });
    if (!category) throw new NotFoundException('Product category not found');
    const isAdminOrOwner = actor?.role === 'admin' || (actor && category.store.ownerId === actor.user_id);
    if (!isAdminOrOwner && (!category.isActive || category.store.status !== 'ACTIVE')) {
      throw new NotFoundException('Product category not found');
    }
    const { store: _store, ...publicCategory } = category;
    return publicCategory;
  }

  async update(actor: Actor | number, id: number, dto: UpdateProductCategoryDto) {
    const existing = await this.findOne(id, typeof actor === 'number' ? undefined : actor);
    await this.assertOwnership(actor, existing.storeId);
    return this.prisma.productCategory.update({
      where: { prodCategoryId: id },
      data: dto,
    });
  }

  async remove(actor: Actor | number, id: number) {
    const existing = await this.findOne(id, typeof actor === 'number' ? undefined : actor);
    await this.assertOwnership(actor, existing.storeId);
    await this.prisma.productCategory.delete({ where: { prodCategoryId: id } });
    return { message: 'Product category deleted successfully' };
  }

  private async assertOwnership(actor: Actor | number, storeId: number) {
    if (typeof actor !== 'number' && actor.role === 'admin') return;
    const userId = typeof actor === 'number' ? actor : actor.user_id;
    const store = await this.prisma.store.findUnique({ where: { storeId }, select: { ownerId: true } });
    if (!store || store.ownerId !== userId) throw new ForbiddenException('Store ownership required');
  }
}
