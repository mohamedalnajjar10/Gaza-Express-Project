import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsInt, IsNumber, IsString,
  Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';

export class AddressDto {
  @IsString() @Matches(/\S/) @MaxLength(80)
  label: string;

  @IsString() @Matches(/\S/) @MaxLength(500)
  address: string;

  @IsNumber({ maxDecimalPlaces: 8 }) @Min(-90) @Max(90)
  latitude: number;

  @IsNumber({ maxDecimalPlaces: 8 }) @Min(-180) @Max(180)
  longitude: number;
}

export class CartItemDto {
  @IsInt() @Min(1) @Max(2147483647)
  productId: number;

  @IsInt() @Min(1) @Max(99)
  quantity: number;

  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) @Max(2147483647, { each: true })
  optionIds: number[];
}

export class ReplaceCartDto {
  @IsInt() @Min(0) @Max(2147483647)
  version: number;

  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CartItemDto)
  items: CartItemDto[];
}

export class CheckoutDto {
  @ValidateIf(dto => dto.paymentMethod !== undefined) @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsInt() @Min(1) @Max(2147483647)
  addressId: number;

  @IsInt() @Min(1) @Max(2147483647)
  cartVersion: number;
}

export enum OrderAction {
  ACCEPT = 'accept',
  QUOTE = 'quote',
  APPROVE_QUOTE = 'approve_quote',
  REJECT = 'reject',
  CANCEL = 'cancel',
  READY = 'ready',
  ASSIGN = 'assign',
  ACCEPT_ASSIGNMENT = 'accept_assignment',
  DECLINE_ASSIGNMENT = 'decline_assignment',
  PICK_UP = 'pick_up',
  DELIVER = 'deliver',
  REPORT_DELIVERY_ISSUE = 'report_delivery_issue',
  RESET_DELIVERY_CODE = 'reset_delivery_code',
}

export class OrderActionDto {
  @ValidateIf(dto => dto.deliveryCode !== undefined || dto.action === OrderAction.DELIVER)
  @IsString() @Matches(/^\d{6}$/)
  deliveryCode?: string;

  @ValidateIf(dto => dto.collectedAmount !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99)
  collectedAmount?: number;

  @IsEnum(OrderAction)
  action: OrderAction;

  @IsInt() @Min(1) @Max(2147483647)
  version: number;

  @ValidateIf(dto => dto.total !== undefined || dto.action === OrderAction.QUOTE)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99)
  total?: number;

  @ValidateIf(dto => dto.driverId !== undefined || dto.action === OrderAction.ASSIGN)
  @IsInt() @Min(1) @Max(2147483647)
  driverId?: number;

  @ValidateIf(dto => dto.reason !== undefined || dto.action === OrderAction.REJECT || dto.action === OrderAction.CANCEL || dto.action === OrderAction.REPORT_DELIVERY_ISSUE || dto.action === OrderAction.RESET_DELIVERY_CODE)
  @IsString() @Matches(/\S/) @MaxLength(500)
  reason?: string;
}
