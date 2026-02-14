import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Expense } from './expense.entity';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
    constructor(private readonly expensesService: ExpensesService) { }

    @Get()
    async findAll(@Req() req: AuthenticatedRequest, @Query('groupId') groupId?: string) {
        const userId = req.user.userId;
        if (groupId) {
            return this.expensesService.findByGroupId(groupId, userId);
        }
        return this.expensesService.findAll(userId);
    }

    @Post()
    async create(
        @Req() req: AuthenticatedRequest,
        @Body() expense: Omit<Expense, 'id' | 'paidBy'> & { invitedUsers?: Array<{ name: string; mobile?: string }> },
    ) {
        return this.expensesService.create(expense, req.user.userId);
    }
}
