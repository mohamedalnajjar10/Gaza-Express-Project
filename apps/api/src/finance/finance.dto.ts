import { Transform, Type } from 'class-transformer';
import { Length, IsBoolean, IsIn, IsInt, IsNumber, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class DriverApprovalDto { @IsBoolean() approved: boolean; }
export class DriverAvailabilityDto {
  @ValidateIf((_dto, value) => value !== undefined)
  @IsBoolean()
  available?: boolean;

  @ValidateIf((_dto, value) => value !== undefined && value !== null)
  @IsInt() @Min(1) @Max(7)
  dispatchAreaId?: number | null;
}

export class BankReconciliationDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99)
  amount: number;

  @IsIn(['ILS'])
  currency: string;

  @IsString() @Matches(/^[A-Za-z0-9_.:-]{3,70}$/)
  reference: string;
}

export class SettlementDto {
  @IsIn(['cash_handover', 'store_payout', 'driver_payout'])
  kind: 'cash_handover' | 'store_payout' | 'driver_payout';

  @IsString() @Matches(/^[A-Za-z0-9_.:-]{3,100}$/)
  reference: string;
}

export class UploadReceiptDto {
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_dto, value) => value !== undefined)
  @IsString() @Matches(/^[A-Za-z0-9_.:-]{3,100}$/, { message: 'رقم مرجع التحويل يجب أن يتكون من 3 إلى 100 حرف (أحرف إنجليزية أو أرقام)' })
  transferReference?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_dto, value) => value !== undefined)
  @IsString() @Matches(/^0(?:59|56)\d{7}$/, { message: 'رقم الجوال المحوّل يجب أن يتكون من 10 أرقام ويبدأ بـ 059 أو 056' })
  senderPhone?: string;

  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  @ValidateIf((_dto, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99)
  claimedAmount?: number;
}

export class ReceiptReportDto {
  @IsString() @Length(5, 500) @Matches(/\S.{3,}\S/u)
  reason: string;
}

export class ReceiptDecisionDto {
  @IsIn(['dismiss', 'suspend'])
  decision: 'dismiss' | 'suspend';

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_dto, value) => value !== undefined)
  @IsString() @MaxLength(500)
  note?: string;
}

export class AdminReceiptQueueDto {
  @ValidateIf((_dto, value) => value !== undefined)
  @IsIn(['reported', 'suspicious', 'pending', 'all'])
  status?: 'reported' | 'suspicious' | 'pending' | 'all';

  @ValidateIf((_dto, value) => value !== undefined)
  @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page?: number;

  @ValidateIf((_dto, value) => value !== undefined)
  @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}
