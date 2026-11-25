import { IsInt, IsString, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ description: 'Store ID' })
  @IsInt()
  @Min(1)
  storeId: number;

  @ApiProperty({ description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Review comment' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  comment?: string;
}
