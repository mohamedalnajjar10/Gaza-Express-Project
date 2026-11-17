import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Request,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { IMAGE_UPLOAD_LIMIT } from '../infrastructure/s3-image-storage';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Patch('profile')
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({ summary: 'Update the signed-in user name, email and avatar' })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: IMAGE_UPLOAD_LIMIT,
        files: 1,
        fields: 2,
        fieldSize: 2048,
      },
    }),
  )
  update(
    @Request() req,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() image?: { buffer: Buffer },
  ) {
    return this.profiles.update(req.user.user_id, dto, image?.buffer);
  }

  @Get('images/:name')
  @Header('Cache-Control', 'private, no-store')
  async image(@Request() req, @Param('name') name: string) {
    return new StreamableFile(
      await this.profiles.openImage(req.user.user_id, name),
      { type: 'image/webp' },
    );
  }
}
