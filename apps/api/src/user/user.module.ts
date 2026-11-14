import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtModule } from '@nestjs/jwt';


@Module({
  imports: [JwtModule],
  providers: [UserService, RolesGuard],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule { }