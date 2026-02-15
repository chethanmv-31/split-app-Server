import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { SupabaseService } from '../common/supabase/supabase.service';

describe('UsersService', () => {
  let service: UsersService;
  let rows: any[];

  const okJson = (data: any) => new Response(JSON.stringify(data), { status: 200 });

  const supabaseService = {
    rest: jest.fn(async (pathWithQuery: string, init?: RequestInit) => {
      if (pathWithQuery.startsWith('users?select=*')) {
        return okJson(rows);
      }

      if (pathWithQuery === 'users' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        rows.push(body);
        return okJson([body]);
      }

      if (pathWithQuery.startsWith('users?id=eq.') && init?.method === 'PATCH') {
        const id = decodeURIComponent(pathWithQuery.replace('users?id=eq.', ''));
        const patch = JSON.parse(String(init.body || '{}'));
        const idx = rows.findIndex((u) => u.id === id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...patch };
        }
        return okJson(idx >= 0 ? [rows[idx]] : []);
      }

      return new Response('Not found', { status: 404 });
    }),
    uploadBase64Object: jest.fn(async () => 'https://example.com/avatar.jpg'),
  };

  beforeEach(async () => {
    rows = [];
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: SupabaseService, useValue: supabaseService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('creates users with hashed passwords and UUID ids', async () => {
    const created = await service.create({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'Secret123!',
      mobile: '9999999999',
    });

    expect(created.password).toBeUndefined();
    expect(created.passwordHash).toBeDefined();
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('matches phone numbers independent of plus-prefix formatting', async () => {
    rows.push({
      id: 'u-1',
      name: 'Phone User',
      mobile: '+15551234567',
    });

    const user = await service.findOneByMobile('15551234567');

    expect(user?.id).toBe('u-1');
  });
});
