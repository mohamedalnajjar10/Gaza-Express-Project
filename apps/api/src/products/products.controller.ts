import { PageDto } from 'src/common/dto/page.dto';
import { ProductListDto, ProductSearchDto } from './dto/product-list.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  Query, ParseIntPipe, UseGuards, Request, UploadedFile, UseInterceptors, StreamableFile, Header,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
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
    @Query() query: ProductListDto
  ) {
    return this.service.findByStore(storeId, query.availableOnly !== 'false', query);
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
  options(@Param('id', ParseIntPipe) id: number, @Query() page: PageDto) {
    return this.service.findOptions(id, page);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get product details' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
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
  create(@Request() req, @Body() dto: CreateProductDto, @UploadedFile() image?: { buffer: Buffer }) {
    return this.service.create(req.user.user_id, dto, image?.buffer);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ProductImageInterceptor)
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (owner only)' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto, @UploadedFile() image?: { buffer: Buffer }) {
    return this.service.update(req.user.user_id, id, dto, image?.buffer);
  }

  @Patch(':id/toggle-availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle product availability (owner only)' })
  toggleAvailability(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.toggleAvailability(req.user.user_id, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product (owner only)' })
  delete(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.delete(req.user.user_id, id);
  }
}
