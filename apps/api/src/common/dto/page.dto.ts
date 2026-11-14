import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(200)
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 25;
}

export function pageWindow({ page, limit }: PageDto = new PageDto()) {
  return { skip: (page - 1) * limit, take: limit };
}

export class StorePageDto extends PageDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(2147483647)
  storeId?: number;
}

export class CategoryPageDto extends PageDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(2147483647)
  categoryId?: number;
}
