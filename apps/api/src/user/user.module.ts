import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileMediaService } from './profile-media.service';

@Module({
  providers: [UserService, RolesGuard, ProfileService, ProfileMediaService],
  controllers: [UserController, ProfileController],
  exports: [UserService],
})
export class UserModule {}
