import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Readable } from 'node:stream';
import sharp from 'sharp';

export const IMAGE_UPLOAD_LIMIT = 5 * 1024 * 1024;
const keyPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.webp$/;
const bucket = 'product-media';

export class S3ImageStorage {
  private readonly client?: S3Client;
  private readonly path: string;
  private readonly logger = new Logger(S3ImageStorage.name);

  constructor(
    config: ConfigService,
    private readonly scope: 'products' | 'profiles',
    private readonly size = 1200,
  ) {
    this.path = `/${config.get<string>('API_PREFIX') || 'api/v1'}/${scope === 'profiles' ? 'account' : 'products'}/images/`;
    const endpoint = config.get<string>('PRODUCT_MEDIA_ENDPOINT');
    if (endpoint) {
      const url = new URL(endpoint);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid media storage endpoint');
      this.client = new S3Client({
        endpoint,
        forcePathStyle: true,
        region: 'us-east-1',
        maxAttempts: 2,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        requestHandler: new NodeHttpHandler({
          connectionTimeout: 2000,
          requestTimeout: 5000,
          throwOnRequestTimeout: true,
          httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 32 }),
          httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 32 }),
        }),
        credentials: {
          accessKeyId: config.getOrThrow<string>('PRODUCT_MEDIA_ACCESS_KEY'),
          secretAccessKey: config.getOrThrow<string>('PRODUCT_MEDIA_SECRET_KEY'),
        },
      });
    }
  }

  async upload(bytes: Buffer) {
    if (bytes.length > IMAGE_UPLOAD_LIMIT)
      throw new BadRequestException('حجم الصورة يتجاوز 5 ميغابايت.');
    const client = this.storage();
    let image: Buffer;
    try {
      const input = sharp(bytes, {
        limitInputPixels: 16_000_000,
        failOn: 'error',
      });
      const metadata = await input.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format) ||
        (metadata.pages ?? 1) > 1
      ) {
        throw new Error('Unsupported image format');
      }
      image = await input
        .rotate()
        .resize(this.size, this.size, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'ارفع صورة JPG أو PNG أو WebP صالحة، بحد أقصى 16 مليون بكسل.',
      );
    }
    const name = `${randomUUID()}.webp`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: `${this.scope}/${name}`, Body: image, ContentLength: image.length, ContentType: 'image/webp',
      }));
    } catch {
      throw new ServiceUnavailableException('Image storage unavailable');
    }
    return this.path + name;
  }

  async open(name: string) {
    if (!keyPattern.test(name)) throw new NotFoundException('Image not found');
    const client = this.storage();
    try {
      const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${this.scope}/${name}` }));
      if (!(Body instanceof Readable)) throw new Error('Storage response has no readable body');
      return Body;
    } catch (error) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('Image not found');
      }
      throw new ServiceUnavailableException('Image storage unavailable');
    }
  }

  async remove(path?: string | null) {
    if (!path?.startsWith(this.path)) return;
    const name = path.slice(this.path.length);
    if (!keyPattern.test(name)) return;
    try {
      await this.storage().send(new DeleteObjectCommand({ Bucket: bucket, Key: `${this.scope}/${name}` }));
    } catch {
      this.logger.warn('Could not remove an unused image');
    }
  }

  private storage() {
    if (!this.client)
      throw new ServiceUnavailableException('Image storage unavailable');
    return this.client;
  }
}
