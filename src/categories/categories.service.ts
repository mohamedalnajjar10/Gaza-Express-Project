import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('Category name already exists');
      throw error;
    }
  }

  async findAll(page = new PageDto()) {
    return this.prisma.category.findMany({
      ...pageWindow(page), where: { isActive: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { subCategories: true } } }
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { subCategories: { where: { isActive: true }, orderBy: { id: 'asc' }, take: 25 } }
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('Category name already exists');
      throw error;
    }
  }

  async remove(id: number) {
    const category = await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
    return {
      message: 'Category successfully deleted',
    };
  }
}