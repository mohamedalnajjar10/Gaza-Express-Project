import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './dto/create-product-category.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateProductCategoryDto) {
    const store = await this.prisma.store.findUnique({
      where: { storeId: dto.storeId },
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return this.prisma.productCategory.create({ data: dto });
  }

  async findAll(storeId?: number) {
    const where: any = { isActive: true };
    if (storeId) where.storeId = storeId;
    return this.prisma.productCategory.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.productCategory.findUnique({
      where: { prodCategoryId: id },
    });
    if (!category) throw new NotFoundException('Product category not found');
    return category;
  }

  async update(id: number, dto: UpdateProductCategoryDto) {
    await this.findOne(id);
    return this.prisma.productCategory.update({
      where: { prodCategoryId: id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    const category = await this.prisma.productCategory.delete({ where: { prodCategoryId: id } });
    return { message: 'Product category deleted successfully' };
  }
}
