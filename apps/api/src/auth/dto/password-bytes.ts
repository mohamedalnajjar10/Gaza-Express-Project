import { ValidateBy } from 'class-validator';

export const PasswordBytes = () => ValidateBy({
  name: 'passwordBytes',
  validator: {
    validate: value => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72,
    defaultMessage: () => 'Password must be at most 72 UTF-8 bytes',
  },
});
