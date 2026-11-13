import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './dto/create-product-category.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(userId: number, dto: CreateProductCategoryDto) {
    const store = await this.prisma.store.findUnique({
      where: { storeId: dto.storeId },
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    await this.assertOwnership(userId, dto.storeId);
    return this.prisma.productCategory.create({ data: dto });
  }

  async findAll(storeId?: number, page = new PageDto()) {
    const where: any = { isActive: true };
    if (storeId) where.storeId = storeId;
    return this.prisma.productCategory.findMany({
      ...pageWindow(page),
      where,
      orderBy: [{ sortOrder: 'asc' }, { prodCategoryId: 'asc' }],
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.productCategory.findUnique({
      where: { prodCategoryId: id },
    });
    if (!category) throw new NotFoundException('Product category not found');
    return category;
  }

  async update(userId: number, id: number, dto: UpdateProductCategoryDto) {
    const existing = await this.findOne(id);
    await this.assertOwnership(userId, existing.storeId);
    return this.prisma.productCategory.update({
      where: { prodCategoryId: id },
      data: dto,
    });
  }

  async remove(userId: number, id: number) {
    const existing = await this.findOne(id);
    await this.assertOwnership(userId, existing.storeId);
    const category = await this.prisma.productCategory.delete({ where: { prodCategoryId: id } });
    return { message: 'Product category deleted successfully' };
  }
  private async assertOwnership(userId: number, storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { storeId }, select: { ownerId: true } });
    if (!store || store.ownerId !== userId) throw new ForbiddenException('Store ownership required');
  }
}
