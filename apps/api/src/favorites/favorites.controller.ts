import { FavoritesPageDto } from './dto/favorites-page.dto';
import {
  Controller, Get, Post, Delete, Param, ParseIntPipe,
  UseGuards, Request, Query
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('❤️ Favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly service: FavoritesService) { }

  // Store Favorites
  @Get('stores')
  @ApiOperation({ summary: 'Get my favorite stores' })
  getMyFavoriteStores(@Request() req, @Query() page: FavoritesPageDto) {
    return this.service.getMyFavoriteStores(req.user.user_id, page);
  }

  @Post('stores/:storeId')
  @ApiOperation({ summary: 'Add store to favorites' })
  addStoreFavorite(@Request() req, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.service.addStoreToFavorites(req.user.user_id, storeId);
  }

  @Delete('stores/:storeId')
  @ApiOperation({ summary: 'Remove store from favorites' })
  removeStoreFavorite(@Request() req, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.service.removeStoreFromFavorites(req.user.user_id, storeId);
  }

  @Get('stores/check/:storeId')
  @ApiOperation({ summary: 'Check if store is favorite' })
  checkStoreFavorite(@Request() req, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.service.isStoreFavorite(req.user.user_id, storeId);
  }

  // Product Favorites
  @Get('products')
  @ApiOperation({ summary: 'Get my favorite products' })
  getMyFavoriteProducts(@Request() req, @Query() page: FavoritesPageDto) {
    return this.service.getMyFavoriteProducts(req.user.user_id, page);
  }

  @Post('products/:productId')
  @ApiOperation({ summary: 'Add product to favorites' })
  addProductFavorite(@Request() req, @Param('productId', ParseIntPipe) productId: number) {
    return this.service.addProductToFavorites(req.user.user_id, productId);
  }

  @Delete('products/:productId')
  @ApiOperation({ summary: 'Remove product from favorites' })
  removeProductFavorite(@Request() req, @Param('productId', ParseIntPipe) productId: number) {
    return this.service.removeProductFromFavorites(req.user.user_id, productId);
  }

  @Get('products/check/:productId')
  @ApiOperation({ summary: 'Check if product is favorite' })
  checkProductFavorite(@Request() req, @Param('productId', ParseIntPipe) productId: number) {
    return this.service.isProductFavorite(req.user.user_id, productId);
  }
}
