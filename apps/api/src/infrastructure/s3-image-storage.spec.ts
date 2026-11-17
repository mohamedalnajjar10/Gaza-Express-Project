import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import sharp from 'sharp';
import { IMAGE_UPLOAD_LIMIT, S3ImageStorage } from './s3-image-storage';

jest.mock('minio', () => ({ Client: jest.fn() }));
describe('S3 image storage', () => {
  let client: any;
  let storage: S3ImageStorage;
  beforeEach(() => {
    client = {
      putObject: jest.fn().mockResolvedValue({}),
      getObject: jest.fn(),
      removeObject: jest.fn(),
    };
    (Client as unknown as jest.Mock).mockImplementation(() => client);
    storage = new S3ImageStorage(
      new ConfigService({
        PRODUCT_MEDIA_ENDPOINT: 'http://localhost:9000',
        PRODUCT_MEDIA_ACCESS_KEY: 'test',
        PRODUCT_MEDIA_SECRET_KEY: 'test-secret',
      }),
      'profiles',
      512,
    );
  });
  it('decodes a real image, resizes it, and writes WebP under the profiles prefix', async () => {
    const source = await sharp({
      create: { width: 700, height: 600, channels: 3, background: '#257a50' },
    })
      .png()
      .toBuffer();
    const path = await storage.upload(source);
    expect(path).toMatch(/^\/api\/v1\/account\/images\/[a-f0-9-]+\.webp$/);
    const [bucket, key, bytes, length, headers] =
      client.putObject.mock.calls[0];
    expect(bucket).toBe('product-media');
    expect(key).toBe(`profiles/${path.split('/').pop()}`);
    expect(length).toBe(bytes.length);
    expect(headers['Content-Type']).toBe('image/webp');
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: 'webp',
      width: 512,
    });
  });
  it.each([
    Buffer.from('not an image'),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    ),
    Buffer.alloc(IMAGE_UPLOAD_LIMIT + 1),
  ])('rejects invalid or oversized uploads', async (bytes) => {
    await expect(storage.upload(bytes)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.putObject).not.toHaveBeenCalled();
  });
  it('does not delete external images or another image scope', async () => {
    await storage.remove('https://example.com/avatar.webp');
    await storage.remove(
      '/api/v1/products/images/11111111-1111-1111-1111-111111111111.webp',
    );
    expect(client.removeObject).not.toHaveBeenCalled();
    await expect(storage.open('../../secrets')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
