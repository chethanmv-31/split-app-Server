import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';

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
        @Body() expense: CreateExpenseDto,
    ) {
        return this.expensesService.create(expense, req.user.userId);
    }
}
