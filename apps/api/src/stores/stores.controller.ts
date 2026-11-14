import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StoreModerationDto, StoreModerationPageDto } from './dto/store-moderation.dto';
import { PageDto } from 'src/common/dto/page.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import {
  Controller, Get, Post, Body, Patch, Param, Delete, Query,
  ParseIntPipe, DefaultValuePipe, UseGuards, Request, Header
} from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { QueryStoresDto } from './dto/query-stores.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('Stores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stores')
export class StoresController {
  constructor(private readonly service: StoresService) { }

  @Get('top-rated')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get top rated stores' })
  findTopRated(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number) {
    return this.service.findTopRated(limit);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get all stores with filters' })
  findAll(@Query() query: QueryStoresDto) {
    return this.service.findAll(query);
  }

  @Get('my-stores')
  @ApiOperation({ summary: 'Get my stores' })
  findMyStores(@Request() req, @Query() page: PageDto) {
    return this.service.findMyStores(req.user.user_id, page);
  }

  @Get('moderation')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  moderationQueue(@Query() query: StoreModerationPageDto) {
    return this.service.moderationQueue(query);
  }

  @Patch(':id/moderation')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  moderate(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: StoreModerationDto) {
    return this.service.moderate(req.user.user_id, id, dto);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
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
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStoreDto) {
    return this.service.update(req.user.user_id, id, dto);
  }

  @Patch(':id/toggle-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle store open/close status' })
  toggleStatus(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(req.user.user_id, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete store' })
  delete(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.delete(req.user.user_id, id);
  }
}
