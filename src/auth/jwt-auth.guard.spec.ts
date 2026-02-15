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

  it('throws when bearer token is missing', async () => {
    const guard = new JwtAuthGuard({ verifyAccessToken: jest.fn() } as any);
    await expect(guard.canActivate(createContext())).rejects.toThrow(UnauthorizedException);
  });

  it('attaches user payload when token is valid', async () => {
    const verifyAccessToken = jest.fn().mockResolvedValue({ userId: 'user-1' });
    const guard = new JwtAuthGuard({ verifyAccessToken } as any);
    const request = { headers: { authorization: 'Bearer token-abc' } } as any;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('token-abc');
    expect(request.user.userId).toBe('user-1');
  });
});
