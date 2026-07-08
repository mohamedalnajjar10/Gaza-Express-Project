import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  Query, ParseIntPipe, UseGuards, Request, ForbiddenException
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) { }

  @Get('store/:storeId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get products by store' })
  findByStore(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('availableOnly') availableOnly: string = 'true'
  ) {
    return this.service.findByStore(storeId, availableOnly === 'true');
  }

  @Get('search/:storeId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Search products in store' })
  search(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('q') query: string
  ) {
    return this.service.search(storeId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get product details' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product (store owners)' })
  create(@Request() req, @Body() dto: CreateProductDto) {
    return this.service.create(req.user.user_id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (owner only)' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateProductDto>) {
    return this.service.update(req.user.user_id, id, dto);
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
