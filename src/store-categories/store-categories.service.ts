import { Injectable, ConflictException } from '@nestjs/common';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StoreCategoriesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateStoreCategoryDto) {
    try {
      return await this.prisma.storeCategory.create({ data: dto });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Category name already exists');
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.storeCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.storeCategory.findUnique({ where: { categoryId: id } });
    if (!category) throw new Error('Store category not found');
    return category;
  }
}