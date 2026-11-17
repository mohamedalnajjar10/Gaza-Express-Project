import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileMediaService } from './profile-media.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ProfileMediaService,
  ) {}

  async update(userId: number, dto: UpdateProfileDto, image?: Buffer) {
    if (dto.full_name === undefined && dto.email === undefined && !image) {
      throw new BadRequestException('لا توجد بيانات لتحديثها.');
    }
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: { profile_photo_url: true },
    });
    if (!user) throw new NotFoundException('الحساب غير موجود.');
    const photo = image ? await this.media.upload(image) : undefined;
    let updated;
    try {
      updated = await this.prisma.user.update({
        where: {
          user_id: userId,
          ...(photo && { profile_photo_url: user.profile_photo_url }),
        },
        data: {
          // Explicit allowlist: self-service cannot change role, phone or verification.
          ...(dto.full_name !== undefined && {
            full_name: dto.full_name,
            full_name_ar: dto.full_name,
          }),
          ...(dto.email !== undefined && { email: dto.email || null }),
          ...(photo && { profile_photo_url: photo }),
        },
        select: {
          user_id: true,
          full_name: true,
          full_name_ar: true,
          email: true,
          phone: true,
          role: true,
          profile_photo_url: true,
          created_at: true,
        },
      });
    } catch (error) {
      if (photo) await this.media.remove(photo);
      if (error?.code === 'P2002')
        throw new ConflictException('البريد الإلكتروني مستخدم في حساب آخر.');
      if (error?.code === 'P2025')
        throw new ConflictException(
          'تغيّرت بيانات الحساب. حدّث الصفحة وحاول مجددًا.',
        );
      throw error;
    }
    if (photo && photo !== user.profile_photo_url)
      await this.media.remove(user.profile_photo_url);
    return updated;
  }

  async openImage(userId: number, name: string) {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: { profile_photo_url: true },
    });
    if (!user?.profile_photo_url?.endsWith(`/account/images/${name}`))
      throw new NotFoundException('الصورة غير موجودة.');
    return this.media.open(name);
  }
}
