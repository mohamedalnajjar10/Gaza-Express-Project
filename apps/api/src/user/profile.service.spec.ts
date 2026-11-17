import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

describe('Self-service profile', () => {
  const oldPhoto = '/api/v1/account/images/old.webp';
  const newPhoto = '/api/v1/account/images/new.webp';
  let db: any;
  let media: any;
  let service: ProfileService;
  beforeEach(() => {
    db = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ profile_photo_url: oldPhoto }),
        update: jest
          .fn()
          .mockResolvedValue({
            user_id: 7,
            full_name: 'New name',
            profile_photo_url: newPhoto,
          }),
      },
    };
    media = {
      upload: jest.fn().mockResolvedValue(newPhoto),
      remove: jest.fn(),
      open: jest.fn(),
    };
    service = new ProfileService(db, media);
  });

  it('saves only editable fields and removes the old image after success', async () => {
    await service.update(
      7,
      { full_name: 'New name', email: 'new@example.com', role: 'admin' } as any,
      Buffer.from('image'),
    );
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 7, profile_photo_url: oldPhoto },
        data: {
          full_name: 'New name',
          full_name_ar: 'New name',
          email: 'new@example.com',
          profile_photo_url: newPhoto,
        },
      }),
    );
    expect(media.remove).toHaveBeenCalledWith(oldPhoto);
  });

  it('keeps the previous image and removes the new upload when email conflicts', async () => {
    db.user.update.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.update(7, { email: 'used@example.com' }, Buffer.from('image')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(media.remove).toHaveBeenCalledTimes(1);
    expect(media.remove).toHaveBeenCalledWith(newPhoto);
  });

  it('cleans up a losing concurrent avatar update', async () => {
    db.user.update.mockRejectedValue({ code: 'P2025' });
    await expect(
      service.update(7, {}, Buffer.from('image')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(media.remove).toHaveBeenCalledWith(newPhoto);
    expect(media.remove).not.toHaveBeenCalledWith(oldPhoto);
  });

  it('does not upload or change images during a name/email update', async () => {
    await service.update(7, { full_name: 'New name', email: '' });
    expect(db.user.update.mock.calls[0][0].data).toEqual({
      full_name: 'New name',
      full_name_ar: 'New name',
      email: null,
    });
    expect(media.upload).not.toHaveBeenCalled();
    expect(media.remove).not.toHaveBeenCalled();
  });

  it('rejects empty changes and cannot read another profile image', async () => {
    await expect(service.update(7, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.openImage(7, 'someone-else.webp'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(media.open).not.toHaveBeenCalled();
  });

  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: UpdateProfileDto };
  it('normalizes names and emails', async () => {
    await expect(
      pipe.transform(
        { full_name: '  أحمد محمد  ', email: ' TEST@EXAMPLE.COM ' },
        metadata,
      ),
    ).resolves.toMatchObject({
      full_name: 'أحمد محمد',
      email: 'test@example.com',
    });
  });
  it.each([
    { role: 'admin' },
    { user_id: 2 },
    { profile_photo_url: 'https://example.com/photo' },
    { full_name: '  ' },
    { full_name: null },
    { email: null },
    { email: 'invalid' },
  ])('rejects invalid or privileged fields: %j', async (body) => {
    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
