import {
  Controller, Get, Post, Delete, Body, Param, ParseIntPipe,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a review for a store (auto-updates store rating)' })
  create(@Request() req, @Body() dto: CreateReviewDto) {
    return this.service.create(req.user.user_id, dto);
  }

  @Get('store/:storeId')
  @ApiOperation({ summary: 'Get all reviews for a store' })
  findByStore(@Param('storeId', ParseIntPipe) storeId: number) {
    return this.service.findByStore(storeId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a review (owner or admin only)' })
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user.user_id, id, req.user.role);
  }
}
