import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';
describe('Public registration role boundary', () => {
  it('rejects administrative privilege selection', async () => {
    const dto = plainToInstance(RegisterDto, { phone: '0591234567', full_name: 'Test Customer', password: 'StrongPassword1!', role: 'admin' });
    const errors = await validate(dto);
    expect(errors.some(error => error.property === 'role')).toBe(true);
  });
});
