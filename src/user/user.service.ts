import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { AUTH_CONSTANTS } from '../auth/constants/auth.constants';

export type UserPayload = Omit<User, 'password_hash'>;

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) { }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findById(userId: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { user_id: userId } });
  }

  async validatePassword(user: User, plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, user.password_hash);
  }

  async createUserForAuth(
    phone: string,
    password: string,
    fullName: string,
    fullNameAr?: string,
    email?: string,
    role?: UserRole,
  ): Promise<User> {
    const exists = await this.findByPhone(phone);
    if (exists) throw new ConflictException('Phone number already registered');

    return this.prisma.user.create({
      data: {
        phone,
        password_hash: await bcrypt.hash(password, AUTH_CONSTANTS.BCRYPT_ROUNDS),
        full_name: fullName,
        full_name_ar: fullNameAr,
        email,
        role: role ?? UserRole.customer,
        is_active: true,
        is_verified: false,
      },
    });
  }

  async markAsVerified(userId: number): Promise<User> {
    return this.prisma.user.update({
      where: { user_id: userId },
      data: { is_verified: true },
    });
  }

  async create(createUserDto: CreateUserDto): Promise<UserPayload> {
    try {
      const exists = await this.findByPhone(createUserDto.phone);
      if (exists) {
        throw new ConflictException('Phone number already registered');
      }

      const hashedPassword = await bcrypt.hash(createUserDto.password, AUTH_CONSTANTS.BCRYPT_ROUNDS);

      const newUser = await this.prisma.user.create({
        data: {
          phone: createUserDto.phone,
          password_hash: hashedPassword,
          full_name: createUserDto.full_name,
          full_name_ar: createUserDto.full_name_ar ?? null,
          email: createUserDto.email ?? null,
          role: createUserDto.role ?? 'customer',
          is_active: true,
          is_verified: false,
          language_pref: 'ar',
        },
      });


      return this.mapToPublic(newUser);

    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `${error.meta?.target?.includes('phone') ? 'Phone number' : 'Email'} already registered`
        );
      }
      throw error;
    }
  }

  async findAll(page = new PageDto()): Promise<UserPayload[]> {
    const users = await this.prisma.user.findMany({ ...pageWindow(page), orderBy: { user_id: 'asc' } });
    return users.map((u) => this.mapToPublic(u));
  }

  async findOnePublic(id: number): Promise<UserPayload> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return this.mapToPublic(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<UserPayload> {
    await this.findOnePublic(id);

    const updateData: Prisma.UserUpdateInput = {};

    if (updateUserDto.full_name !== undefined) {
      updateData.full_name = updateUserDto.full_name;
    }

    if (updateUserDto.full_name_ar !== undefined) {
      updateData.full_name_ar = updateUserDto.full_name_ar;
    }

    if (updateUserDto.email !== undefined) {
      const emailExists = await this.prisma.user.findFirst({
        where: {
          email: updateUserDto.email,
          NOT: { user_id: id }
        }
      });

      if (emailExists) {
        throw new ConflictException('Email already registered');
      }

      updateData.email = updateUserDto.email;
    }

    if (updateUserDto.password !== undefined) {
      updateData.password_hash = await bcrypt.hash(
        updateUserDto.password,
        AUTH_CONSTANTS.BCRYPT_ROUNDS
      );
    }

    if (updateUserDto.role !== undefined) {
      updateData.role = updateUserDto.role;
    }

    if (updateUserDto.language_pref !== undefined) {
      updateData.language_pref = updateUserDto.language_pref;
    }
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No data to update');
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { user_id: id },
        data: updateData,
      });

      return this.mapToPublic(updatedUser);

    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Data already registered');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`User #${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: number): Promise<{ message: string }> {
    await this.findOnePublic(id);
    await this.prisma.user.update({
      where: { user_id: id },
      data: { is_active: false },
    });
    return { message: 'Account disabled successfully' };
  }

  private mapToPublic(user: User): UserPayload {
    const { password_hash, ...result } = user;
    return result;
  }

  async findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: { googleId },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async createGoogleUser(data: {
    googleId: string;
    email: string;
    full_name: string;
    profile_photo_url?: string;
  }) {
    const phoneHash = crypto
      .createHash('md5')
      .update(data.googleId)
      .digest('hex')
      .substring(0, 16);

    return this.prisma.user.create({
      data: {
        googleId: data.googleId,
        email: data.email.toLowerCase(),
        full_name: data.full_name,
        profile_photo_url: data.profile_photo_url,
        provider: 'google',
        phone: `g_${phoneHash}`,
        password_hash: '',
        is_verified: true,
        is_active: true,
      },
    });
  }

  async linkGoogleAccount(user_id: number, googleId: string, profile_photo_url?: string) {
    return this.prisma.user.update({
      where: { user_id },
      data: {
        googleId,
        provider: 'google',
        profile_photo_url: profile_photo_url || null,
      },
    });
  }

  async updateLastLogin(user_id: number): Promise<void> {
    await this.prisma.user.update({
      where: { user_id },
      data: { last_seen_at: new Date() },
    }
    );
  }
}