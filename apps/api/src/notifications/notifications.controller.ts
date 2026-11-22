import type { AuthenticatedRequest } from '../common/authenticated-request';
import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from 'prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

class SmsResolutionDto {
  @IsIn(['DELIVERED', 'FAILED']) status: 'DELIVERED' | 'FAILED';
  @IsString() @Matches(/\S/) @MaxLength(250) reason: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('before', new ParseIntPipe({ optional: true })) before?: number) {
    const rows = await this.db.notification.findMany({
      where: { userId: req.user.user_id, ...(before !== undefined ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' }, take: 51,
      select: { id: true, kind: true, orderId: true, readAt: true, createdAt: true },
    });
    return { notifications: rows.slice(0, 50), nextBefore: rows.length > 50 ? rows[49].id : null };
  }

  @Patch(':id/read')
  @HttpCode(204)
  async read(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const where = { id, userId: req.user.user_id };
    const updated = await this.db.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
    if (!updated.count && !(await this.db.notification.findFirst({ where, select: { id: true } }))) throw new NotFoundException('Notification not found');
  }

  @Patch('sms-queue/:id/resolution')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async resolveSms(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SmsResolutionDto) {
    const result = await this.db.smsJob.updateMany({
      where: { id, status: 'UNKNOWN' },
      data: { status: dto.status, resolutionActorId: req.user.user_id, resolutionReason: dto.reason.trim() },
    });
    if (!result.count) throw new ConflictException('Only uncertain deliveries can be reconciled');
    return { status: dto.status };
  }

  @Get('sms-queue')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async queue() {
    const [counts, recentFailures, oldestPending] = await Promise.all([
      this.db.smsJob.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.smsJob.findMany({ where: { status: { in: ['FAILED', 'UNKNOWN', 'EXPIRED'] } }, orderBy: { updatedAt: 'desc' }, take: 20,
        select: { id: true, status: true, errorCode: true, attempts: true, updatedAt: true, resolutionActorId: true },
      }),
      this.db.smsJob.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return { counts, recentFailures, oldestPendingAt: oldestPending?.createdAt ?? null };
  }
}
