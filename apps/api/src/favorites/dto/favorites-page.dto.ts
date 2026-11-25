import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PageDto, pageWindow } from 'src/common/dto/page.dto';

export class FavoritesPageDto extends PageDto {
  @ApiPropertyOptional({ enum: ['1'], description: 'Include one extra item while keeping the page offset based on limit.' })
  @IsOptional()
  @IsIn(['1'])
  lookahead?: '1';
}

export function favoritesPageWindow(page: FavoritesPageDto) {
  const { skip, take } = pageWindow(page);
  return { skip, take: take + (page.lookahead === '1' ? 1 : 0) };
}
