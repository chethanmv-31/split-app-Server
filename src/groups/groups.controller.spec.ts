import { Test, TestingModule } from '@nestjs/testing';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('GroupsController', () => {
  let controller: GroupsController;
  let groupsService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    groupsService = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [GroupsController],
      providers: [{ provide: GroupsService, useValue: groupsService }],
    });

    const module: TestingModule = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<GroupsController>(GroupsController);
  });

  it('lists groups for authenticated user only', async () => {
    groupsService.findAll.mockResolvedValue([]);
    const req = { user: { userId: 'auth-user' } } as any;

    await controller.findAll(req);

    expect(groupsService.findAll).toHaveBeenCalledWith('auth-user');
  });

  it('creates group with creator from token, not request body', async () => {
    groupsService.create.mockResolvedValue({ id: 'group-1' });
    const req = { user: { userId: 'auth-user' } } as any;
    const body = { name: 'Trip', members: ['u1'], createdBy: 'forged-user' } as any;

    await controller.create(req, body);

    expect(groupsService.create).toHaveBeenCalledWith(body, 'auth-user');
  });
});
