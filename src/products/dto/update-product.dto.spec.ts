import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProductDto } from './update-product.dto';
describe('Product update boundary', () => {
  it('rejects changing store ownership through product update', async () => {
    const errors = await validate(plainToInstance(UpdateProductDto, { storeId: 42 }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some(error => error.property === 'storeId')).toBe(true);
  });
});
