import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Expense } from './expense.entity';

@Controller('expenses')
export class ExpensesController {
    constructor(private readonly expensesService: ExpensesService) { }

    @Get()
    async findAll(@Query('userId') userId?: string, @Query('groupId') groupId?: string) {
        if (groupId) {
            return this.expensesService.findByGroupId(groupId);
        }
        if (userId) {
            return this.expensesService.findByUserId(userId);
        }
        return this.expensesService.findAll();
    }

    @Post()
    async create(@Body() expense: Omit<Expense, 'id'> & { createdBy?: string; invitedUsers?: Array<{ name: string; mobile?: string }> }) {
        return this.expensesService.create(expense);
    }
}
