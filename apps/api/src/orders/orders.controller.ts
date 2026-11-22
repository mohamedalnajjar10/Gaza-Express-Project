import type { AuthenticatedRequest } from '../common/authenticated-request';
import { PageDto } from 'src/common/dto/page.dto';
import {
  Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, ParseIntPipe,
  Patch, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AddressDto, CheckoutDto, DeliveryCompanyDto, DriverCompanyDto, DriverLocationDto, OrderActionDto, ReplaceCartDto } from './orders.dto';
import { OrdersService } from './orders.service';
import { DispatchService } from './dispatch.service';
import { OrderUpdates } from './order-updates';

@ApiTags('Order lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersController {
  constructor(private readonly service: OrdersService, private readonly dispatch: DispatchService, private readonly updates: OrderUpdates) {}

  @Get('addresses')
  @Header('Cache-Control', 'private, no-store')
  addresses(@Req() req: AuthenticatedRequest, @Query() page: PageDto) { return this.service.addresses(req.user, page); }

  @Patch('addresses/onboarding')
  skipAddress(@Req() req: AuthenticatedRequest) { return this.service.skipAddressOnboarding(req.user); }

  @Put('addresses/default')
  saveDefaultAddress(@Req() req: AuthenticatedRequest, @Body() dto: AddressDto) {
    return this.service.saveDefaultAddress(req.user, dto);
  }

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

  @Get('orders/updates')
  async orderUpdates(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    this.updates.open(res, req.user, await this.dispatch.canSeeIndependentOffers(req.user));
  }

  @Get('orders/:id')
  @Header('Cache-Control', 'private, no-store')
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

  @Get('drivers/me/offers')
  @Header('Cache-Control', 'private, no-store')
  offers(@Req() req: AuthenticatedRequest) {
    return this.dispatch.independentOffers(req.user);
  }

  @Put('drivers/me/location')
  @HttpCode(204)
  location(@Req() req: AuthenticatedRequest, @Body() dto: DriverLocationDto) {
    return this.dispatch.updateLocation(req.user, dto);
  }

  @Delete('drivers/me/location')
  @HttpCode(204)
  clearLocation(@Req() req: AuthenticatedRequest) {
    return this.dispatch.updateLocation(req.user);
  }

  @Get('orders/:id/driver-tracking')
  @Header('Cache-Control', 'private, no-store')
  tracking(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.dispatch.tracking(req.user, id);
  }

  @Get('delivery-companies/me/queue')
  @Header('Cache-Control', 'private, no-store')
  companyQueue(@Req() req: AuthenticatedRequest) {
    return this.dispatch.companyQueue(req.user);
  }

  @Get('stores/:id/delivery-partners')
  @Header('Cache-Control', 'private, no-store')
  partners(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.dispatch.partnersForStore(req.user, id);
  }

  @Put('stores/:id/delivery-contracts/:companyId/request')
  @HttpCode(204)
  requestContract(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Param('companyId', ParseIntPipe) companyId: number) {
    return this.dispatch.requestContract(req.user, id, companyId);
  }

  @Put('stores/:id/delivery-contracts/:companyId/confirm')
  @HttpCode(204)
  confirmContract(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Param('companyId', ParseIntPipe) companyId: number) {
    return this.dispatch.confirmContract(req.user, id, companyId);
  }

  @Get('delivery-companies')
  companies(@Req() req: AuthenticatedRequest) {
    return this.dispatch.listCompanies(req.user);
  }

  @Post('delivery-companies')
  createCompany(@Req() req: AuthenticatedRequest, @Body() dto: DeliveryCompanyDto) {
    return this.dispatch.createCompany(req.user, dto);
  }

  @Put('stores/:id/delivery-contracts/:companyId')
  @HttpCode(204)
  addContract(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Param('companyId', ParseIntPipe) companyId: number) {
    return this.dispatch.addContract(req.user, id, companyId);
  }

  @Put('drivers/:id/delivery-company')
  @HttpCode(204)
  linkDriver(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: DriverCompanyDto) {
    return this.dispatch.linkDriver(req.user, id, dto.deliveryCompanyId);
  }
}
