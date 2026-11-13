import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('Administrative authorization', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);
  function context(user: unknown): ExecutionContext {
    return { getHandler: () => null, getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
  }
  beforeEach(() => reflector.getAllAndOverride.mockReturnValue(['admin']));
  it.each([undefined, { role: 'customer', is_active: true }, { role: 'admin', is_active: false }])(
    'denies missing, unauthorized, and disabled identities', user => {
      expect(() => guard.canActivate(context(user))).toThrow(ForbiddenException);
    });
  it('allows an active administrator', () => {
    expect(guard.canActivate(context({ role: 'admin', is_active: true }))).toBe(true);
  });
});
