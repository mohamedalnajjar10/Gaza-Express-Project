import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsString,
  Matches, Max, MaxLength, Min, ValidateBy, ValidateIf, ValidateNested,
} from 'class-validator';

function Coordinate(min: number, max: number, field: string) {
  return ValidateBy({
    name: 'coordinate',
    validator: {
      validate: value =>
        typeof value === 'number' && Number.isFinite(value) &&
        value >= min && value <= max && value === Number(value.toFixed(8)),
      defaultMessage: () => `${field} يجب أن يكون بين ${min} و${max} وبحد أقصى 8 منازل عشرية.`,
    },
  });
}

export class AddressDto {
  @IsString() @Matches(/\S/) @MaxLength(80)
  label: string;

  @IsString() @Matches(/\S/) @MaxLength(500)
  address: string;

  @ValidateIf((_dto, value) => value !== undefined) @IsString() @Matches(/\S/) @MaxLength(120)
  area?: string;

  @ValidateIf((_dto, value) => value !== undefined) @IsIn(['APARTMENT', 'HOUSE', 'OFFICE'])
  residenceType?: 'APARTMENT' | 'HOUSE' | 'OFFICE';

  @ValidateIf((_dto, value) => value !== undefined) @IsString() @Matches(/\S/) @MaxLength(160)
  building?: string;

  @ValidateIf((_dto, value) => value !== undefined) @IsString() @MaxLength(40)
  floor?: string;

  @ValidateIf((_dto, value) => value !== undefined) @IsString() @Matches(/\S/) @MaxLength(160)
  street?: string;

  @ValidateIf((_dto, value) => value !== undefined) @IsString() @Matches(/^\+?[0-9]{8,15}$/)
  phone?: string;

  @ValidateIf((_dto, value) => value !== undefined) @IsString() @MaxLength(300)
  directions?: string;

  @Coordinate(-90, 90, 'خط العرض')
  latitude: number;

  @Coordinate(-180, 180, 'خط الطول')
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
  @ValidateIf(dto => dto.note !== undefined) @IsString() @MaxLength(400)
  note?: string;

  @ValidateIf(dto => dto.redeemReward !== undefined) @IsBoolean()
  redeemReward?: boolean;

  @ValidateIf(dto => dto.paymentMethod !== undefined) @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsInt() @Min(1) @Max(2147483647)
  addressId: number;

  @IsInt() @Min(1) @Max(2147483647)
  cartVersion: number;
}

export class DriverLocationDto {
  @Coordinate(-90, 90, 'خط العرض')
  latitude: number;

  @Coordinate(-180, 180, 'خط الطول')
  longitude: number;
}

export class DeliveryCompanyDto {
  @IsString() @Matches(/\S/) @MaxLength(160)
  name: string;

  @IsInt() @Min(1) @Max(2147483647)
  managerId: number;
}

export class DriverCompanyDto {
  @ValidateIf((_dto, value) => value !== null)
  @IsInt() @Min(1) @Max(2147483647)
  deliveryCompanyId: number | null;
}

export enum OrderAction {
  ACCEPT = 'accept',
  QUOTE = 'quote',
  APPROVE_QUOTE = 'approve_quote',
  REJECT = 'reject',
  CANCEL = 'cancel',
  CONFIRM_RETURN = 'confirm_return',
  READY = 'ready',
  ASSIGN = 'assign',
  ACCEPT_ASSIGNMENT = 'accept_assignment',
  DECLINE_ASSIGNMENT = 'decline_assignment',
  CLAIM_DELIVERY = 'claim_delivery',
  COMPANY_ASSIGN = 'company_assign',
  REROUTE_DELIVERY = 'reroute_delivery',
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

  @ValidateIf(dto => dto.driverId !== undefined || [OrderAction.ASSIGN, OrderAction.COMPANY_ASSIGN].includes(dto.action))
  @IsInt() @Min(1) @Max(2147483647)
  driverId?: number;

  @ValidateIf((_dto, value) => value !== undefined && value !== null)
  @IsInt() @Min(1) @Max(2147483647)
  deliveryCompanyId?: number | null;

  @ValidateIf(dto => dto.reason !== undefined || [OrderAction.REJECT, OrderAction.CANCEL, OrderAction.CONFIRM_RETURN, OrderAction.REPORT_DELIVERY_ISSUE, OrderAction.RESET_DELIVERY_CODE, OrderAction.REROUTE_DELIVERY].includes(dto.action))
  @IsString() @Matches(/\S/) @MaxLength(500)
  reason?: string;
}
