import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; sendOtp: jest.Mock; verifyOtp: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      sendOtp: jest.fn(),
      verifyOtp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns token on login', async () => {
    authService.login.mockResolvedValue({
      success: true,
      accessToken: 'mock-token',
      user: { id: 'user-1', name: 'A' },
    });

    const result = await controller.login({ email: 'a@example.com', password: 'secret' } as any);

    expect(result.accessToken).toBe('mock-token');
    expect(result.user.id).toBe('user-1');
  });

  it('sendOtp response does not include otp', async () => {
    authService.sendOtp.mockResolvedValue({ success: true, message: 'OTP sent successfully' });

    const result = await controller.sendOtp({ mobile: '9999999999' } as any);

    expect(result.success).toBe(true);
    expect((result as any).otp).toBeUndefined();
  });
});
