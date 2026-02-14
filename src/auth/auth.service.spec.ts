import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { SmsService } from './sms.service';
import { JwtTokenService } from './jwt-token.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { validateCredentials: jest.Mock; findOneByMobile: jest.Mock };
  let smsService: { sendSms: jest.Mock };
  let jwtTokenService: { sign: jest.Mock };

  beforeEach(async () => {
    usersService = {
      validateCredentials: jest.fn(),
      findOneByMobile: jest.fn(),
    };
    smsService = {
      sendSms: jest.fn(),
    };
    jwtTokenService = {
      sign: jest.fn().mockReturnValue('mock-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: SmsService, useValue: smsService },
        { provide: JwtTokenService, useValue: jwtTokenService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('logs in with valid credentials and returns token without sensitive fields', async () => {
    usersService.validateCredentials.mockResolvedValue({
      id: 'user-1',
      name: 'A',
      email: 'a@example.com',
      passwordHash: 'hashed',
    });

    const result = await service.login('a@example.com', 'secret');

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('mock-token');
    expect(result.user).toEqual({
      id: 'user-1',
      name: 'A',
      email: 'a@example.com',
    });
    expect((result.user as any).passwordHash).toBeUndefined();
  });

  it('sendOtp does not leak otp in response', async () => {
    usersService.findOneByMobile.mockResolvedValue({ id: 'user-1', name: 'A', mobile: '9999999999' });
    smsService.sendSms.mockResolvedValue(true);

    const result = await service.sendOtp('9999999999');

    expect(result.success).toBe(true);
    expect((result as any).otp).toBeUndefined();
  });
});
