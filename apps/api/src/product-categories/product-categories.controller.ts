import type { AuthenticatedRequest } from 'src/common/authenticated-request';
import { StorePageDto } from 'src/common/dto/page.dto';
import { Request, Controller, Get, Post, Body, Patch, Delete, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ProductCategoriesService } from './product-categories.service';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './dto/create-product-category.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('📦 Product Categories')
@Controller('product-categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) { }

  @Get()
  @ApiOperation({ summary: 'Get all product categories (optional filter by storeId)' })
  @ApiQuery({ name: 'storeId', required: false, type: Number })
  findAll(@Request() req: AuthenticatedRequest, @Query() page: StorePageDto) {
    return this.service.findAll(page.storeId, page, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product category by ID' })
  findOne(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product category (store owner or admin)' })
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateProductCategoryDto) {
    return this.service.create(req.user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product category' })
  update(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductCategoryDto) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product category' })
  remove(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user, id);
  }
}
