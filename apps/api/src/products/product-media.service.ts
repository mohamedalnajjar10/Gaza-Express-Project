import {
  BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Client } from 'minio';
import sharp from 'sharp';

export const PRODUCT_IMAGE_LIMIT = 5 * 1024 * 1024;
const keyPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.webp$/;
const bucket = 'product-media';

@Injectable()
export class ProductMediaService {
  private readonly client?: Client;
  private readonly path: string;
  private readonly logger = new Logger(ProductMediaService.name);

  constructor(config: ConfigService) {
    this.path = `/${config.get<string>('API_PREFIX') || 'api/v1'}/products/images/`;
    const endpoint = config.get<string>('PRODUCT_MEDIA_ENDPOINT');
    if (endpoint) {
      const url = new URL(endpoint);
      this.client = new Client({
        endPoint: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        useSSL: url.protocol === 'https:',
        region: 'us-east-1',
        transportAgent: url.protocol === 'https:'
          ? new HttpsAgent({ keepAlive: true, timeout: 5_000 })
          : new HttpAgent({ keepAlive: true, timeout: 5_000 }),
        accessKey: config.getOrThrow<string>('PRODUCT_MEDIA_ACCESS_KEY'),
        secretKey: config.getOrThrow<string>('PRODUCT_MEDIA_SECRET_KEY'),
      });
    }
  }

  async upload(bytes: Buffer) {
    const client = this.storage();
    let image: Buffer;
    try {
      const input = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
        throw new Error('Unsupported image format');
      }
      image = await input.rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer();
    } catch {
      throw new BadRequestException('ارفع صورة JPG أو PNG أو WebP صالحة، بحد أقصى 16 مليون بكسل.');
    }
    const name = `${randomUUID()}.webp`;
    try {
      await client.putObject(bucket, `products/${name}`, image, image.length, { 'Content-Type': 'image/webp' });
    } catch {
      throw new ServiceUnavailableException('Product image storage unavailable');
    }
    return this.path + name;
  }

  async open(name: string) {
    if (!keyPattern.test(name)) throw new NotFoundException('Product image not found');
    const client = this.storage();
    try {
      return await client.getObject(bucket, `products/${name}`);
    } catch (error) {
      if (error?.code === 'NoSuchKey' || error?.code === 'NotFound') {
        throw new NotFoundException('Product image not found');
      }
      throw new ServiceUnavailableException('Product image storage unavailable');
    }
  }

  async remove(path?: string | null) {
    if (!path?.startsWith(this.path)) return;
    const name = path.slice(this.path.length);
    if (!keyPattern.test(name)) return;
    try {
      await this.storage().removeObject(bucket, `products/${name}`);
    } catch {
      this.logger.warn('Could not remove an unused product image');
    }
  }

  private storage() {
    if (!this.client) throw new ServiceUnavailableException('Product image storage unavailable');
    return this.client;
  }
}
