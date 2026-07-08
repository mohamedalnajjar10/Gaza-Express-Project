import {
  Controller, Get, Post, Body, Patch, Param, Delete, Query,
  ParseIntPipe, DefaultValuePipe, UseGuards, Request
} from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { QueryStoresDto } from './dto/query-stores.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly service: StoresService) { }

  @Get('top-rated')
  @ApiOperation({ summary: 'Get top rated stores' })
  findTopRated(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number) {
    return this.service.findTopRated(limit);
  }

  @Get()
  @ApiOperation({ summary: 'Get all stores with filters' })
  findAll(@Query() query: QueryStoresDto) {
    return this.service.findAll(query);
  }

  @Get('my-stores')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my stores' })
  findMyStores(@Request() req) {
    return this.service.findMyStores(req.user.user_id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get store details with products' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new store (for store owners)' })
  create(@Request() req, @Body() dto: CreateStoreDto) {
    return this.service.create(req.user.user_id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update store' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateStoreDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle store open/close status' })
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete store' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}