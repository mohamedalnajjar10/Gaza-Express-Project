import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

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
  ): Promise<User> {
    const exists = await this.findByPhone(phone);
    if (exists) throw new ConflictException('Phone number already registered');

    return this.prisma.user.create({
      data: { // ✅ data field is explicitly present
        phone,
        password_hash: await bcrypt.hash(password, 10),
        full_name: fullName,
        full_name_ar: fullNameAr,
        email,
        role: UserRole.customer,
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

  async updateLastLogin(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { user_id: userId },
      data: { last_seen_at: new Date() },
    });
  }

  async create(createUserDto: CreateUserDto): Promise<UserPayload> {
    // console.log(' [UserService.create] Starting with:', createUserDto);

    try {
      const exists = await this.findByPhone(createUserDto.phone);
      if (exists) {
        throw new ConflictException('Phone number already registered');
      }

      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

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

      // console.log('[UserService.create] User created:', newUser.user_id);
      return this.mapToPublic(newUser);

    } catch (error: any) {
      // console.error('[UserService.create] FULL ERROR:', {
      //   name: error.name,
      //   message: error.message,
      //   code: error.code,
      //   meta: error.meta,
      // });
      throw error;
    }
  }

  async findAll(): Promise<UserPayload[]> {
    const users = await this.prisma.user.findMany();
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
        10
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
}
