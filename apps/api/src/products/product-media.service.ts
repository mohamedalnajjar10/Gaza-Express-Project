import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3ImageStorage,
  IMAGE_UPLOAD_LIMIT,
} from '../infrastructure/s3-image-storage';

export const PRODUCT_IMAGE_LIMIT = IMAGE_UPLOAD_LIMIT;

@Injectable()
export class ProductMediaService extends S3ImageStorage {
  constructor(config: ConfigService) {
    super(config, 'products');
  }
}
