import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { CatalogCache } from 'src/infrastructure/catalog-cache';
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { UpdateStoreCategoryDto } from './dto/update-store-category.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StoreCategoriesService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CatalogCache) {}

  async create(dto: CreateStoreCategoryDto) {
    try {
      const category = await this.prisma.storeCategory.create({ data: dto });
      await this.cache.invalidate();
      return category;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Category name already exists');
      }
      throw error;
    }
  }

  async findAll(page = new PageDto()) {
    const load = () => this.prisma.storeCategory.findMany({
      where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { categoryId: 'asc' }], ...pageWindow(page),
    });
    return page.page === 1 && page.limit === 25 ? this.cache.read('store-categories', load) : load();
  }

  async findOne(id: number) {
    const category = await this.prisma.storeCategory.findUnique({ where: { categoryId: id } });
    if (!category) throw new NotFoundException('Store category not found');
    return category;
  }

  async update(id: number, dto: UpdateStoreCategoryDto) {
    try {
      const category = await this.prisma.storeCategory.update({ where: { categoryId: id }, data: dto });
      await this.cache.invalidate();
      return category;
    } catch (error) {
      if (error.code === 'P2025') throw new NotFoundException('Store category not found');
      if (error.code === 'P2002') throw new ConflictException('Category name already exists');
      throw error;
    }
  }
}