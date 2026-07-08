import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SubCategoryService } from './subcategory.service';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('SubCategories')
@Controller('subcategories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@ApiBearerAuth()
export class SubCategoryController {
  constructor(private readonly service: SubCategoryService) { }

  @Post()
  @ApiOperation({ summary: 'Create new subcategory' })
  @ApiResponse({ status: 201, description: 'Subcategory successfully created.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  create(@Body() dto: CreateSubCategoryDto) { return this.service.create(dto); }

  @Get()
  @ApiQuery({ name: 'categoryId', required: false, type: Number, description: 'Optional category ID to filter by' })
  @ApiOperation({ summary: 'Get subcategories (optionally filtered by categoryId)' })
  @ApiResponse({ status: 200, description: 'List of subcategories.' })
  findAll(@Query('categoryId') categoryId?: number) {
    return this.service.findAll(categoryId ? +categoryId : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subcategory by ID' })
  @ApiParam({ name: 'id', type: 'number', description: 'Subcategory ID' })
  @ApiResponse({ status: 200, description: 'The found subcategory.' })
  @ApiResponse({ status: 404, description: 'Subcategory not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id')
  @ApiOperation({ summary: 'Update subcategory' })
  @ApiParam({ name: 'id', type: 'number', description: 'Subcategory ID' })
  @ApiResponse({ status: 200, description: 'Subcategory successfully updated.' })
  @ApiResponse({ status: 404, description: 'Subcategory not found.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete subcategory' })
  @ApiParam({ name: 'id', type: 'number', description: 'Subcategory ID' })
  @ApiResponse({ status: 200, description: 'Subcategory successfully deleted.' })
  @ApiResponse({ status: 404, description: 'Subcategory not found.' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}