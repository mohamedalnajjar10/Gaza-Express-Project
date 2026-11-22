import { IsBoolean } from 'class-validator';

export class StoreAvailabilityDto { @IsBoolean() isOpenNow: boolean; }
export class ProductAvailabilityDto { @IsBoolean() isAvailable: boolean; }
