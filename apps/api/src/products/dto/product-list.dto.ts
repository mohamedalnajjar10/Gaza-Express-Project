import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PageDto } from 'src/common/dto/page.dto';

export class ProductListDto extends PageDto {
  @IsIn(['true', 'false'])
  availableOnly = 'true';

  @Type(() => Number) @IsOptional() @IsInt() @Min(1)
  categoryId?: number;

  @IsOptional() @IsString() @MaxLength(80)
  q?: string;
}

export class ProductSearchDto extends PageDto {
  @IsString() @MinLength(1) @MaxLength(80)
  q: string;
}
