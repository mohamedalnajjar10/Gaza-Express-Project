import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3ImageStorage } from '../infrastructure/s3-image-storage';

@Injectable()
export class ProfileMediaService extends S3ImageStorage {
  constructor(config: ConfigService) {
    super(config, 'profiles', 512);
  }
}
