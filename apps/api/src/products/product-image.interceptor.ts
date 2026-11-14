import { FileInterceptor } from '@nestjs/platform-express';
import { PRODUCT_IMAGE_LIMIT } from './product-media.service';

export const ProductImageInterceptor = FileInterceptor('image', {
  limits: { fileSize: PRODUCT_IMAGE_LIMIT, files: 1, fields: 20, fieldSize: 16 * 1024 },
});
