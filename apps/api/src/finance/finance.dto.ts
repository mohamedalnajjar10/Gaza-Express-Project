import { IsBoolean, IsIn, IsInt, IsNumber, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

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
