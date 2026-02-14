import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Expense } from './expense.entity';
import { UsersService } from '../users/users.service';
import { PushNotificationService } from '../common/push-notifications.service';
import { DbService } from '../common/db/db.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
    constructor(
        private usersService: UsersService,
        private pushNotificationService: PushNotificationService,
        private dbService: DbService,
    ) { }

    async findAll(userId: string): Promise<Expense[]> {
        const db = await this.dbService.readDb();
        return (db.expenses as Expense[]).filter(
            (expense) => expense.paidBy === userId || expense.splitBetween.includes(userId),
        );
    }

    async create(
        expense: CreateExpenseDto,
        createdBy: string,
    ): Promise<Expense> {
        if (!Array.isArray(expense.splitBetween) || expense.splitBetween.length === 0) {
            throw new BadRequestException('splitBetween must contain at least one user');
        }

        if (expense.groupId) {
            const db = await this.dbService.readDb();
            const group = (db.groups as Array<{ id: string; members: string[] }>).find((item) => item.id === expense.groupId);
            if (!group) {
                throw new NotFoundException('Group not found');
            }
            if (!group.members.includes(createdBy)) {
                throw new ForbiddenException('You are not a member of this group');
            }

            const nonMembers = expense.splitBetween.filter((userId) => !group.members.includes(userId));
            if (nonMembers.length > 0) {
                throw new ForbiddenException('All splitBetween users must be members of the group');
            }
        }

        if (expense.invitedUsers && expense.invitedUsers.length > 0) {
            for (const invitedUserData of expense.invitedUsers) {
                try {
                    await this.usersService.createInvitedUser({
                        name: invitedUserData.name,
                        mobile: invitedUserData.mobile,
                    });
                } catch (error) {
                    console.error('Error creating invited user during expense creation:', error);
                }
            }
        }

        const uniqueSplitUsers = Array.from(new Set(expense.splitBetween));
        for (const userId of uniqueSplitUsers) {
            const userExists = await this.usersService.findOneById(userId);
            if (!userExists) {
                throw new NotFoundException(`User ${userId} not found`);
            }
        }

        const newExpense = {
            ...(expense as Omit<Expense, 'id' | 'paidBy'>),
            splitBetween: uniqueSplitUsers,
            paidBy: createdBy,
            id: randomUUID(),
        } as Expense;
        delete (newExpense as any).invitedUsers;

        await this.dbService.updateDb((db) => {
            (db.expenses as Expense[]).push(newExpense);
        });

        this.triggerPushNotifications(newExpense, createdBy);

        return newExpense;
    }

    private async triggerPushNotifications(expense: Expense, createdBy?: string) {
        try {
            // Get the creator's name for the notification
            const creator = createdBy ? await this.usersService.findOneById(createdBy) : null;
            const creatorName = creator?.name || 'Someone';

            // Find all users involved in the split (except the creator)
            const usersInSplit = expense.splitBetween.filter(id => id !== createdBy);

            for (const userId of usersInSplit) {
                const user = await this.usersService.findOneById(userId);
                if (user?.pushToken) {
                    let oweAmount = 0;
                    if (expense.splitType === 'UNEQUAL' && expense.splitDetails) {
                        const detail = expense.splitDetails.find(d => d.userId === userId);
                        oweAmount = detail?.amount || 0;
                    } else {
                        // Default to equal split if not specified or EQUAL
                        oweAmount = expense.amount / expense.splitBetween.length;
                    }

                    await this.pushNotificationService.sendNotification(
                        user.pushToken,
                        'New Expense Added',
                        `${creatorName} added "${expense.title}" (₹${expense.amount}). Pay ₹${oweAmount.toFixed(2)}.`,
                        { expenseId: expense.id }
                    );
                }
            }
        } catch (error) {
            console.error('Error triggering push notifications:', error);
        }
    }

    async findByUserId(userId: string): Promise<Expense[]> {
        const db = await this.dbService.readDb();
        return (db.expenses as Expense[]).filter(e => e.paidBy === userId || e.splitBetween.includes(userId));
    }

    async findByGroupId(groupId: string, userId: string): Promise<Expense[]> {
        const db = await this.dbService.readDb();
        const group = (db.groups as Array<{ id: string; members: string[] }>).find((item) => item.id === groupId);
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        if (!group.members.includes(userId)) {
            throw new ForbiddenException('You are not a member of this group');
        }
        return (db.expenses as Expense[]).filter(e => e.groupId === groupId);
    }
}
