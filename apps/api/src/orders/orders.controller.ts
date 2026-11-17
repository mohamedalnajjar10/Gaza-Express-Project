import { PageDto } from 'src/common/dto/page.dto';
import {
  Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, ParseIntPipe,
  Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AddressDto, CheckoutDto, OrderActionDto, ReplaceCartDto } from './orders.dto';
import { OrdersService } from './orders.service';

type AuthenticatedRequest = { user: { user_id: number; role: UserRole } };

@ApiTags('Order lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get('addresses')
  addresses(@Req() req: AuthenticatedRequest, @Query() page: PageDto) { return this.service.addresses(req.user, page); }

  @Post('addresses')
  createAddress(@Req() req: AuthenticatedRequest, @Body() dto: AddressDto) {
    return this.service.createAddress(req.user, dto);
  }

  @Put('addresses/:id')
  updateAddress(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: AddressDto) {
    return this.service.updateAddress(req.user, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  deleteAddress(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteAddress(req.user, id);
  }

  @Get('cart')
  cart(@Req() req: AuthenticatedRequest) { return this.service.cart(req.user); }

  @Put('cart')
  replaceCart(@Req() req: AuthenticatedRequest, @Body() dto: ReplaceCartDto) {
    return this.service.replaceCart(req.user, dto);
  }

  @Get('rewards')
  @Header('Cache-Control', 'private, no-store')
  rewards(@Req() req: AuthenticatedRequest) { return this.service.rewards(req.user); }

  @Post('orders')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async checkout(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() dto: CheckoutDto) {
    return this.service.view(await this.service.checkout(req.user, key, dto));
  }

  @Get('orders')
  list(@Req() req: AuthenticatedRequest, @Query('before', new ParseIntPipe({ optional: true })) before?: number) {
    return this.service.list(req.user, before);
  }

  @Get('orders/:id')
  get(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(req.user, id);
  }

  @Get('orders/:id/delivery-code')
  @Header('Cache-Control', 'no-store')
  deliveryCode(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.getDeliveryCode(req.user, id);
  }

  @Patch('orders/:id/status')
  act(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: OrderActionDto) {
    return this.service.act(req.user, id, dto);
  }
}
