import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from 'prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UserRole, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AUTH_CONSTANTS } from '../auth/constants/auth.constants';

jest.mock('bcrypt');

describe('UserService', () => {
  let service: UserService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockUser: User = {
    user_id: 1,
    phone: '+966501234567',
    password_hash: 'hashedPassword123',
    full_name: 'John Doe',
    full_name_ar: 'جون دو',
    email: 'john@example.com',
    role: UserRole.customer,
    is_active: true,
    is_verified: false,
    language_pref: 'ar',
    last_seen_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByPhone', () => {
    it('should return user when found by phone', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByPhone('+966501234567');

      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '+966501234567' },
      });
    });

    it('should return null when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findByPhone('+966509999999');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user when found by id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById(1);

      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { user_id: 1 },
      });
    });

    it('should return null when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should return true for valid password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validatePassword(mockUser, 'Password123!');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'Password123!',
        mockUser.password_hash,
      );
    });

    it('should return false for invalid password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validatePassword(mockUser, 'WrongPassword');

      expect(result).toBe(false);
    });
  });

  describe('createUserForAuth', () => {
    it('should create a new user for authentication', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.createUserForAuth(
        '+966501234567',
        'Password123!',
        'John Doe',
        'جون دو',
        'john@example.com',
      );

      expect(result).toEqual(mockUser);
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', AUTH_CONSTANTS.BCRYPT_ROUNDS);
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          phone: '+966501234567',
          password_hash: 'hashedPassword',
          full_name: 'John Doe',
          full_name_ar: 'جون دو',
          email: 'john@example.com',
          role: UserRole.customer,
          is_active: true,
          is_verified: false,
        },
      });
    });

    it('should throw ConflictException if phone already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.createUserForAuth(
          '+966501234567',
          'Password123!',
          'John Doe',
        ),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createUserForAuth(
          '+966501234567',
          'Password123!',
          'John Doe',
        ),
      ).rejects.toThrow('Phone number already registered');
    });
  });

  describe('markAsVerified', () => {
    it('should mark user as verified', async () => {
      const verifiedUser = { ...mockUser, is_verified: true };
      mockPrismaService.user.update.mockResolvedValue(verifiedUser);

      const result = await service.markAsVerified(1);

      expect(result.is_verified).toBe(true);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: 1 },
        data: { is_verified: true },
      });
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      const now = new Date();
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        last_seen_at: now,
      });

      await service.updateLastLogin(1);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: 1 },
        data: { last_seen_at: expect.any(Date) },
      });
    });
  });

  describe('create', () => {
    const createUserDto: CreateUserDto = {
      phone: '+966501234567',
      password: 'Password123!',
      full_name: 'John Doe',
      full_name_ar: 'جون دو',
      email: 'john@example.com',
      role: UserRole.customer,
    };

    it('should create a new user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.create(createUserDto);

      expect(result).not.toHaveProperty('password_hash');
      expect(result.phone).toBe(createUserDto.phone);
      expect(bcrypt.hash).toHaveBeenCalledWith(
        createUserDto.password,
        AUTH_CONSTANTS.BCRYPT_ROUNDS,
      );
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: createUserDto.phone,
          password_hash: 'hashedPassword',
          full_name: createUserDto.full_name,
          full_name_ar: createUserDto.full_name_ar,
          email: createUserDto.email,
          role: createUserDto.role,
          is_active: true,
          is_verified: false,
          language_pref: 'ar',
        }),
      });
    });

    it('should throw ConflictException if phone already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );

      await expect(service.create(createUserDto)).rejects.toThrow(
        'Phone number already registered',
      );
    });

    it('should handle Prisma unique constraint error for phone', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrismaService.user.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['phone'] },
      });

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );

      await expect(service.create(createUserDto)).rejects.toThrow(
        'Phone number already registered',
      );
    });

    it('should handle Prisma unique constraint error for email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrismaService.user.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['email'] },
      });

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );

      await expect(service.create(createUserDto)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('should create user with minimal required fields', async () => {
      const minimalDto: CreateUserDto = {
        phone: '+966501234567',
        password: 'Password123!',
        full_name: 'John Doe',
      };

      const minimalUser = {
        ...mockUser,
        full_name_ar: null,
        email: null,
        role: UserRole.customer,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrismaService.user.create.mockResolvedValue(minimalUser);

      const result = await service.create(minimalDto);

      expect(result).toBeDefined();
      expect(result.full_name_ar).toBeNull();
      expect(result.email).toBeNull();
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: minimalDto.phone,
          full_name: minimalDto.full_name,
          full_name_ar: null,
          email: null,
          role: 'customer',
        }),
      });
    });

    it('should propagate other errors', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');

      const customError = new Error('Database connection failed');
      mockPrismaService.user.create.mockRejectedValue(customError);

      await expect(service.create(createUserDto)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('findAll', () => {
    it('should return array of users without password_hash', async () => {
      const users = [mockUser, { ...mockUser, user_id: 2 }];
      mockPrismaService.user.findMany.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password_hash');
      expect(result[1]).not.toHaveProperty('password_hash');
      expect(result[0]).toHaveProperty('user_id');
      expect(result[1]).toHaveProperty('user_id');
    });

    it('should return empty array when no users exist', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('findOnePublic', () => {
    it('should return user without password_hash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOnePublic(1);

      expect(result).not.toHaveProperty('password_hash');
      expect(result.user_id).toBe(1);
      expect(result.phone).toBe(mockUser.phone);
      expect(result.full_name).toBe(mockUser.full_name);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOnePublic(999)).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.findOnePublic(999)).rejects.toThrow(
        'User #999 not found',
      );
    });
  });

  describe('update', () => {
    const updateUserDto: UpdateUserDto = {
      full_name: 'John Updated',
      email: 'john.updated@example.com',
    };

    it('should update user successfully', async () => {
      const updatedUser = { ...mockUser, ...updateUserDto };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(1, updateUserDto);

      expect(result.full_name).toBe(updateUserDto.full_name);
      expect(result.email).toBe(updateUserDto.email);
      expect(result).not.toHaveProperty('password_hash');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: 1 },
        data: {
          full_name: updateUserDto.full_name,
          email: updateUserDto.email,
        },
      });
    });

    it('should update password with hashing', async () => {
      const passwordUpdate: UpdateUserDto = { password: 'NewPassword123!' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      await service.update(1, passwordUpdate);

      expect(bcrypt.hash).toHaveBeenCalledWith(
        'NewPassword123!',
        AUTH_CONSTANTS.BCRYPT_ROUNDS,
      );
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: 1 },
        data: expect.objectContaining({ password_hash: 'newHashedPassword', sessionVersion: { increment: 1 } }),
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      const emailUpdate: UpdateUserDto = {
        email: 'existing@example.com',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUser,
        user_id: 2,
        email: 'existing@example.com',
      });

      await expect(service.update(1, emailUpdate)).rejects.toThrow(
        ConflictException,
      );

      await expect(service.update(1, emailUpdate)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('should allow email update for same user', async () => {
      const emailUpdate: UpdateUserDto = {
        email: 'john@example.com',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.update(1, emailUpdate);

      expect(result).toBeDefined();
      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: emailUpdate.email,
          NOT: { user_id: 1 },
        },
      });
    });

    it('should throw BadRequestException when no data to update', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.update(1, {})).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.update(1, {})).rejects.toThrow(
        'No data to update',
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.update(999, updateUserDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update user role', async () => {
      const roleUpdate: UpdateUserDto = { role: UserRole.admin };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        role: UserRole.admin,
      });

      const result = await service.update(1, roleUpdate);

      expect(result.role).toBe(UserRole.admin);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: 1 },
        data: expect.objectContaining({ role: UserRole.admin, sessionVersion: { increment: 1 } }),
      });
    });

    it('should update language preference', async () => {
      const langUpdate: UpdateUserDto = { language_pref: 'en' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        language_pref: 'en',
      });

      const result = await service.update(1, langUpdate);

      expect(result.language_pref).toBe('en');
    });

    it('should update full_name_ar', async () => {
      const nameUpdate: UpdateUserDto = { full_name_ar: 'اسم جديد' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        full_name_ar: 'اسم جديد',
      });

      const result = await service.update(1, nameUpdate);

      expect(result.full_name_ar).toBe('اسم جديد');
    });

    it('should handle Prisma P2002 error (unique constraint)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['email'] },
      });

      await expect(service.update(1, updateUserDto)).rejects.toThrow(
        ConflictException,
      );

      await expect(service.update(1, updateUserDto)).rejects.toThrow(
        'Data already registered',
      );
    });

    it('should handle Prisma P2025 error (record not found)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockRejectedValue({ code: 'P2025' });

      await expect(service.update(1, updateUserDto)).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.update(1, updateUserDto)).rejects.toThrow(
        'User #1 not found',
      );
    });

    it('should propagate unknown errors', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      const customError = new Error('Unknown database error');
      mockPrismaService.user.update.mockRejectedValue(customError);

      await expect(service.update(1, updateUserDto)).rejects.toThrow(
        'Unknown database error',
      );
    });

    it('should update multiple fields at once', async () => {
      const multiUpdate: UpdateUserDto = {
        full_name: 'New Name',
        email: 'new@example.com',
        role: UserRole.admin,
        language_pref: 'en',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        ...multiUpdate,
      });

      const result = await service.update(1, multiUpdate);

      expect(result.full_name).toBe(multiUpdate.full_name);
      expect(result.email).toBe(multiUpdate.email);
      expect(result.role).toBe(multiUpdate.role);
      expect(result.language_pref).toBe(multiUpdate.language_pref);
    });
  });

  describe('remove', () => {
    it('should disable user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        is_active: false,
      });

      const result = await service.remove(1);

      expect(result).toEqual({ message: 'Account disabled successfully' });
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { user_id: 1 },
        data: expect.objectContaining({ is_active: false, sessionVersion: { increment: 1 } }),
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);

      await expect(service.remove(999)).rejects.toThrow(
        'User #999 not found',
      );
    });

    it('should not actually delete the user from database', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        is_active: false,
      });

      await service.remove(1);

      expect(prismaService.user.delete).not.toHaveBeenCalled();
      expect(prismaService.user.update).toHaveBeenCalled();
    });
  });

  describe('mapToPublic (private method behavior)', () => {
    it('should remove password_hash from user object', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOnePublic(1);

      expect(result).not.toHaveProperty('password_hash');
      expect(result).toHaveProperty('user_id');
      expect(result).toHaveProperty('phone');
      expect(result).toHaveProperty('full_name');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('role');
    });

    it('should preserve all other user properties', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOnePublic(1);

      expect(result.user_id).toBe(mockUser.user_id);
      expect(result.phone).toBe(mockUser.phone);
      expect(result.full_name).toBe(mockUser.full_name);
      expect(result.full_name_ar).toBe(mockUser.full_name_ar);
      expect(result.email).toBe(mockUser.email);
      expect(result.role).toBe(mockUser.role);
      expect(result.is_active).toBe(mockUser.is_active);
      expect(result.is_verified).toBe(mockUser.is_verified);
      expect(result.language_pref).toBe(mockUser.language_pref);
    });
  });
});
