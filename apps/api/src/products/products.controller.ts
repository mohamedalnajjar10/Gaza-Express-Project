import type { AuthenticatedRequest } from '../common/authenticated-request';
import { ProductAvailabilityDto } from 'src/common/dto/catalog-state.dto';
import { PageDto } from 'src/common/dto/page.dto';
import { ProductListDto, ProductSearchDto } from './dto/product-list.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  Query, ParseIntPipe, UseGuards, Request, UploadedFile, UseInterceptors, StreamableFile, Header,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductOptionDto, UpdateProductOptionDto } from './dto/product-option.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ProductImageInterceptor } from './product-image.interceptor';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) { }

  @Get('store/:storeId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get products by store' })
  findByStore(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: ProductListDto, @Request() req: AuthenticatedRequest
  ) {
    return this.service.findByStore(storeId, query.availableOnly !== 'false', query, req.user.user_id);
  }

  @Get('store/:storeId/best-sellers')
  bestSellers(@Param('storeId', ParseIntPipe) storeId: number) {
    return this.service.bestSellers(storeId);
  }

  @Get('search/:storeId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Search products in store' })
  search(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: ProductSearchDto
  ) {
    return this.service.search(storeId, query.q, query);
  }

  @Get(':id/options')
  @UseGuards(JwtAuthGuard)
  options(@Param('id', ParseIntPipe) id: number, @Query() page: PageDto, @Request() req: AuthenticatedRequest) {
    return this.service.findOptions(id, page, req.user.user_id);
  }

  @Post(':id/options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product option (store owner or admin)' })
  createOption(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductOptionDto,
  ) {
    return this.service.createOption(req.user, id, dto);
  }

  @Patch(':id/options/:optionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product option (store owner or admin)' })
  updateOption(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('optionId', ParseIntPipe) optionId: number,
    @Body() dto: UpdateProductOptionDto,
  ) {
    return this.service.updateOption(req.user, id, optionId, dto);
  }

  @Delete(':id/options/:optionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.store_owner, UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product option (store owner or admin)' })
  deleteOption(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('optionId', ParseIntPipe) optionId: number,
  ) {
    return this.service.deleteOption(req.user, id, optionId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get product details' })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    return this.service.findOne(id, req.user.user_id);
  }

  @Get('images/:name')
  @Header('Cache-Control', 'private, no-store')
  async image(@Param('name') name: string) {
    const stream = await this.service.openImage(name);
    return new StreamableFile(stream, { type: 'image/webp' });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ProductImageInterceptor)
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product (store owners)' })
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateProductDto, @UploadedFile() image?: { buffer: Buffer }) {
    return this.service.create(req.user.user_id, dto, image?.buffer);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ProductImageInterceptor)
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (owner only)' })
  update(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto, @UploadedFile() image?: { buffer: Buffer }) {
    return this.service.update(req.user.user_id, id, dto, image?.buffer);
  }

  @Patch(':id/toggle-availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set product availability (owner only)' })
  toggleAvailability(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ProductAvailabilityDto) {
    return this.service.toggleAvailability(req.user.user_id, id, dto.isAvailable);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product (owner only)' })
  delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.delete(req.user.user_id, id);
  }
}
