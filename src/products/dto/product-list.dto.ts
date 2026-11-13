import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PageDto } from 'src/common/dto/page.dto';

export class ProductListDto extends PageDto {
  @IsIn(['true', 'false'])
  availableOnly = 'true';
}

export class ProductSearchDto extends PageDto {
  @IsString() @MinLength(1) @MaxLength(80)
  q: string;
}
