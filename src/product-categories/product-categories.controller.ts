import { Controller, Get, Post, Body, Patch, Delete, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ProductCategoriesService } from './product-categories.service';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './dto/create-product-category.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('📦 Product Categories')
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) { }

  @Get()
  @ApiOperation({ summary: 'Get all product categories (optional filter by storeId)' })
  @ApiQuery({ name: 'storeId', required: false, type: Number })
  findAll(@Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number) {
    return this.service.findAll(storeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product category by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product category (store owner or admin)' })
  create(@Body() dto: CreateProductCategoryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product category' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product category' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
