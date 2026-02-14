import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('ExpensesController', () => {
  let controller: ExpensesController;
  let expensesService: { findByGroupId: jest.Mock; findAll: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    expensesService = {
      findByGroupId: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [{ provide: ExpensesService, useValue: expensesService }],
    });

    const module: TestingModule = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<ExpensesController>(ExpensesController);
  });

  it('uses authenticated user id for list and ignores client userId query', async () => {
    expensesService.findAll.mockResolvedValue([]);
    const req = { user: { userId: 'auth-user' } } as any;

    await controller.findAll(req, undefined);

    expect(expensesService.findAll).toHaveBeenCalledWith('auth-user');
  });

  it('uses authenticated user id as expense creator', async () => {
    expensesService.create.mockResolvedValue({ id: 'exp-1' });
    const req = { user: { userId: 'auth-user' } } as any;
    const body = {
      title: 'Dinner',
      amount: 400,
      date: '2026-02-14',
      category: 'Food',
      splitType: 'EQUAL',
      splitBetween: ['u1', 'u2'],
      paidBy: 'forged-user',
    } as any;

    await controller.create(req, body);

    expect(expensesService.create).toHaveBeenCalledWith(body, 'auth-user');
  });
});
