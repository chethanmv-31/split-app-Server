import { JwtAuthGuard } from './jwt-auth.guard';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtAuthGuard', () => {
  const createContext = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization },
        }),
      }),
    }) as any;

  it('throws when bearer token is missing', () => {
    const guard = new JwtAuthGuard({ verify: jest.fn() } as any);
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('attaches user payload when token is valid', () => {
    const verify = jest.fn().mockReturnValue({ userId: 'user-1' });
    const guard = new JwtAuthGuard({ verify } as any);
    const request = { headers: { authorization: 'Bearer token-abc' } } as any;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    const allowed = guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(verify).toHaveBeenCalledWith('token-abc');
    expect(request.user.userId).toBe('user-1');
  });
});
