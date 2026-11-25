import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { lockCustomer } from './cart-pricing';
import type { AddressDto } from './orders.dto';

type AddressOwner = { user_id: number };

@Injectable()
export class AddressesService {
  constructor(private readonly db: PrismaService) {}

  addresses(actor: AddressOwner, page = new PageDto()) {
    return this.db.deliveryAddress.findMany({ where: { customerId: actor.user_id }, orderBy: { id: 'desc' }, ...pageWindow(page) });
  }

  async skipAddressOnboarding(actor: AddressOwner) {
    await this.db.user.updateMany({
      where: { user_id: actor.user_id, addressPromptedAt: null },
      data: { addressPromptedAt: new Date() },
    });
    return { acknowledged: true };
  }

  async saveDefaultAddress(actor: AddressOwner, dto: AddressDto) {
    return this.db.$transaction(async tx => {
      await lockCustomer(tx, actor.user_id);
      const user = await tx.user.findUniqueOrThrow({ where: { user_id: actor.user_id }, select: { defaultAddressId: true } });
      const current = user.defaultAddressId
        ? await tx.deliveryAddress.findFirst({ where: { id: user.defaultAddressId, customerId: actor.user_id } })
        : await tx.deliveryAddress.findFirst({ where: { customerId: actor.user_id }, orderBy: { id: 'desc' } });
      const data = this.addressData(dto);
      const saved = current
        ? await tx.deliveryAddress.update({ where: { id: current.id }, data })
        : await tx.deliveryAddress.create({ data: { ...data, customerId: actor.user_id } });
      await tx.user.update({ where: { user_id: actor.user_id }, data: { defaultAddressId: saved.id, addressPromptedAt: new Date() } });
      return saved;
    });
  }

  async createAddress(actor: AddressOwner, dto: AddressDto) {
    return this.db.$transaction(async tx => {
      await lockCustomer(tx, actor.user_id);
      const saved = await tx.deliveryAddress.create({ data: { ...this.addressData(dto), customerId: actor.user_id } });
      const user = await tx.user.findUniqueOrThrow({ where: { user_id: actor.user_id }, select: { defaultAddressId: true } });
      await tx.user.update({
        where: { user_id: actor.user_id },
        data: { addressPromptedAt: new Date(), defaultAddressId: user.defaultAddressId ?? saved.id },
      });
      return saved;
    });
  }

  async updateAddress(actor: AddressOwner, id: number, dto: AddressDto) {
    return this.db.$transaction(async tx => {
      await lockCustomer(tx, actor.user_id);
      const result = await tx.deliveryAddress.updateMany({ where: { id, customerId: actor.user_id }, data: this.addressData(dto) });
      if (!result.count) throw new NotFoundException('Address not found');
      await tx.user.update({ where: { user_id: actor.user_id }, data: { defaultAddressId: id, addressPromptedAt: new Date() } });
      return tx.deliveryAddress.findUniqueOrThrow({ where: { id } });
    });
  }

  async deleteAddress(actor: AddressOwner, id: number) {
    await this.db.$transaction(async tx => {
      await lockCustomer(tx, actor.user_id);
      const result = await tx.deliveryAddress.deleteMany({ where: { id, customerId: actor.user_id } });
      if (!result.count) throw new NotFoundException('Address not found');
      const user = await tx.user.findUniqueOrThrow({ where: { user_id: actor.user_id }, select: { defaultAddressId: true } });
      if (!user.defaultAddressId) {
        const next = await tx.deliveryAddress.findFirst({ where: { customerId: actor.user_id }, orderBy: { id: 'desc' }, select: { id: true } });
        await tx.user.update({ where: { user_id: actor.user_id }, data: { defaultAddressId: next?.id ?? null } });
      }
    });
  }

  private addressData(dto: AddressDto) {
    return {
      ...dto, label: dto.label.trim(), address: dto.address.trim(),
      ...(dto.area !== undefined && { area: dto.area.trim() }),
      ...(dto.building !== undefined && { building: dto.building.trim() }),
      ...(dto.floor !== undefined && { floor: dto.floor.trim() }),
      ...(dto.street !== undefined && { street: dto.street.trim() }),
      ...(dto.directions !== undefined && { directions: dto.directions.trim() }),
    };
  }

}
