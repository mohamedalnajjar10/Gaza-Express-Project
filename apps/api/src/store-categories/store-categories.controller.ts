import { PageDto } from 'src/common/dto/page.dto';
import { Controller, Query, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { StoreCategoriesService } from './store-categories.service';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { UpdateStoreCategoryDto } from './dto/update-store-category.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('🏪 Store Categories')
@Controller('store-categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StoreCategoriesController {
  constructor(private readonly service: StoreCategoriesService) { }

  @Get()
  @ApiOperation({ summary: 'Get all store categories' })
  findAll(@Query() page?: PageDto) {
    return this.service.findAll(page);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get store category by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create store category (admin only)' })
  create(@Body() dto: CreateStoreCategoryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update store category (admin only)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStoreCategoryDto) {
    return this.service.update(id, dto);
  }
}
