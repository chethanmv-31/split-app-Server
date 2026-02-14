import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DbService } from '../common/db/db.service';

describe('UsersService', () => {
  let service: UsersService;
  let db: { users: any[]; expenses: any[]; groups: any[] };
  let dbService: { readDb: jest.Mock; updateDb: jest.Mock };

  beforeEach(async () => {
    db = { users: [], expenses: [], groups: [] };
    dbService = {
      readDb: jest.fn(async () => db),
      updateDb: jest.fn(async (mutator: any) => mutator(db)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DbService, useValue: dbService },
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
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('migrates legacy raw password users on successful login', async () => {
    db.users.push({
      id: 'legacy-user',
      name: 'Legacy',
      email: 'legacy@example.com',
      password: 'PlainText',
    });

    const user = await service.validateCredentials('legacy@example.com', 'PlainText');

    expect(user).toBeDefined();
    expect(db.users[0].password).toBeUndefined();
    expect(db.users[0].passwordHash).toBeDefined();
  });

  it('matches phone numbers independent of plus-prefix formatting', async () => {
    db.users.push({
      id: 'u-1',
      name: 'Phone User',
      mobile: '+15551234567',
    });

    const user = await service.findOneByMobile('15551234567');

    expect(user?.id).toBe('u-1');
  });
});
