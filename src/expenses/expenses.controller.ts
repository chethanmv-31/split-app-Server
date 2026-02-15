import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateSettlementDto } from './dto/create-settlement.dto';

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

    @Patch(':id')
    async update(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() updates: UpdateExpenseDto,
    ) {
        return this.expensesService.update(id, updates, req.user.userId);
    }

    @Delete(':id')
    async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.expensesService.remove(id, req.user.userId);
    }

    @Post('settlements')
    async createSettlement(
        @Req() req: AuthenticatedRequest,
        @Body() payload: CreateSettlementDto,
    ) {
        return this.expensesService.createSettlement(payload, req.user.userId);
    }

    @Get('settlements')
    async findSettlements(@Req() req: AuthenticatedRequest, @Query('groupId') groupId?: string) {
        return this.expensesService.findSettlements(req.user.userId, groupId);
    }

    @Get('analytics/summary')
    async analyticsSummary(
        @Req() req: AuthenticatedRequest,
        @Query('groupId') groupId?: string,
        @Query('timeFilter') timeFilter?: '30D' | '90D' | 'ALL',
    ) {
        return this.expensesService.getAnalyticsSummary(req.user.userId, { groupId, timeFilter });
    }
}
