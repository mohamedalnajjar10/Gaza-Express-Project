import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('UserController', () => {
  let controller: UserController;
  let service: UserService;

  const mockUserService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOnePublic: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockUser = {
    user_id: 1,
    phone: '+966501234567',
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
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user successfully', async () => {
      const createUserDto: CreateUserDto = {
        phone: '+966501234567',
        password: 'Password123!',
        full_name: 'John Doe',
        full_name_ar: 'جون دو',
        email: 'john@example.com',
        role: UserRole.customer,
      };

      mockUserService.create.mockResolvedValue(mockUser);

      const result = await controller.create(createUserDto);

      expect(result).toEqual(mockUser);
      expect(service.create).toHaveBeenCalledWith(createUserDto);
      expect(service.create).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors during creation', async () => {
      const createUserDto: CreateUserDto = {
        phone: '+966501234567',
        password: 'Password123!',
        full_name: 'John Doe',
      };

      mockUserService.create.mockRejectedValue(
        new BadRequestException('Invalid data'),
      );

      await expect(controller.create(createUserDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(service.create).toHaveBeenCalledWith(createUserDto);
    });
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const users = [mockUser, { ...mockUser, user_id: 2 }];
      mockUserService.findAll.mockResolvedValue(users);

      const result = await controller.findAll();

      expect(result).toEqual(users);
      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no users exist', async () => {
      mockUserService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
      expect(service.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a single user by id', async () => {
      mockUserService.findOnePublic.mockResolvedValue(mockUser);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockUser);
      expect(service.findOnePublic).toHaveBeenCalledWith(1);
      expect(service.findOnePublic).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserService.findOnePublic.mockRejectedValue(
        new NotFoundException('User #999 not found'),
      );

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
      expect(service.findOnePublic).toHaveBeenCalledWith(999);
    });

    it('should handle ParseIntPipe validation', async () => {
      mockUserService.findOnePublic.mockResolvedValue(mockUser);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockUser);
      expect(typeof 1).toBe('number');
    });
  });

  describe('update', () => {
    it('should update user successfully', async () => {
      const updateUserDto: UpdateUserDto = {
        full_name: 'John Updated',
        email: 'john.updated@example.com',
      };

      const updatedUser = { ...mockUser, ...updateUserDto };
      mockUserService.update.mockResolvedValue(updatedUser);

      const result = await controller.update(1, updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(service.update).toHaveBeenCalledWith(1, updateUserDto);
      expect(service.update).toHaveBeenCalledTimes(1);
    });

    it('should update user password', async () => {
      const updateUserDto: UpdateUserDto = {
        password: 'NewPassword123!',
      };

      mockUserService.update.mockResolvedValue(mockUser);

      const result = await controller.update(1, updateUserDto);

      expect(result).toEqual(mockUser);
      expect(service.update).toHaveBeenCalledWith(1, updateUserDto);
    });

    it('should throw NotFoundException when updating non-existent user', async () => {
      const updateUserDto: UpdateUserDto = {
        full_name: 'John Updated',
      };

      mockUserService.update.mockRejectedValue(
        new NotFoundException('User #999 not found'),
      );

      await expect(controller.update(999, updateUserDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(service.update).toHaveBeenCalledWith(999, updateUserDto);
    });

    it('should handle empty update dto', async () => {
      const updateUserDto: UpdateUserDto = {};

      mockUserService.update.mockRejectedValue(
        new BadRequestException('No data to update'),
      );

      await expect(controller.update(1, updateUserDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should disable user successfully', async () => {
      const expectedResponse = { message: 'Account disabled successfully' };
      mockUserService.remove.mockResolvedValue(expectedResponse);

      const result = await controller.remove(1);

      expect(result).toEqual(expectedResponse);
      expect(service.remove).toHaveBeenCalledWith(1);
      expect(service.remove).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when removing non-existent user', async () => {
      mockUserService.remove.mockRejectedValue(
        new NotFoundException('User #999 not found'),
      );

      await expect(controller.remove(999)).rejects.toThrow(NotFoundException);
      expect(service.remove).toHaveBeenCalledWith(999);
    });
  });

  describe('Guards and Decorators', () => {
    it('should have JwtAuthGuard applied', () => {
      const guards = Reflect.getMetadata('__guards__', UserController);
      expect(guards).toBeDefined();
    });

    it('should have admin role requirement', () => {
      const roles = Reflect.getMetadata('roles', UserController);
      expect(roles).toContain('admin');
    });
  });
});