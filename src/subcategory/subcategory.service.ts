import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class SubCategoryService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateSubCategoryDto) {
    const categoryExists = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!categoryExists) throw new NotFoundException('Parent category not found');

    try {
      return await this.prisma.subCategory.create({ data: dto });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('SubCategory name already exists under this category');
      throw error;
    }
  }

  async findAll(categoryId?: number, page = new PageDto()) {
    return this.prisma.subCategory.findMany({
      ...pageWindow(page),
      where: { isActive: true, categoryId },
      include: { category: { select: { id: true, name: true, nameAr: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(id: number) {
    const sub = await this.prisma.subCategory.findUnique({
      where: { id },
      include: { category: true }
    });
    if (!sub) throw new NotFoundException('SubCategory not found');
    return sub;
  }

  async update(id: number, dto: UpdateSubCategoryDto) {
    const existing = await this.findOne(id);

    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      const newCategory = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!newCategory) throw new NotFoundException('New parent category not found');
    }

    try {
      return await this.prisma.subCategory.update({ where: { id }, data: dto });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('SubCategory name already exists under this category');
      throw error;
    }
  }

  async remove(id: number) {
    const subCategory = await this.findOne(id);
    await this.prisma.subCategory.delete({ where: { id } });
    return {
      message: 'SubCategory successfully deleted',
    };
  }
}