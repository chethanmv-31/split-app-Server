import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Expense } from './expense.entity';
import { UsersService } from '../users/users.service';
import { PushNotificationService } from '../common/push-notifications.service';

@Injectable()
export class ExpensesService implements OnModuleInit {
    private readonly dbPath = path.join(process.cwd(), 'db.json');
    private db: { users: any[], expenses: Expense[] } = { users: [], expenses: [] };

    constructor(
        private usersService: UsersService,
        private pushNotificationService: PushNotificationService
    ) { }

    onModuleInit() {
        this.loadDb();
    }

    private loadDb() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                const parsed = JSON.parse(data);
                this.db = {
                    users: parsed.users || [],
                    expenses: parsed.expenses || [],
                };
            } else {
                this.saveDb();
            }
        } catch (error) {
            console.error('Error loading db.json:', error);
            this.db = { users: [], expenses: [] };
        }
    }

    private saveDb() {
        try {
            // Before saving, reload the latest state from disk to preserve other collections
            let diskDb: any = { users: [], expenses: [] };
            if (fs.existsSync(this.dbPath)) {
                try {
                    const data = fs.readFileSync(this.dbPath, 'utf8');
                    diskDb = JSON.parse(data);
                } catch (e) {
                    console.error('Error reading db.json before save:', e);
                }
            }
            // Merge: keep the current expenses state but preserve other fields from disk
            const mergedDb = {
                ...diskDb,
                expenses: this.db.expenses, // Override with current expenses state
            };
            console.log(`[ExpensesService] Saving to db.json - users count: ${mergedDb.users?.length || 0}, expenses count: ${mergedDb.expenses.length}`);
            fs.writeFileSync(this.dbPath, JSON.stringify(mergedDb, null, 2), 'utf8');
            console.log(`[ExpensesService] Successfully saved to ${this.dbPath}`);
        } catch (error) {
            console.error('Error saving db.json:', error);
        }
    }

    async findAll(): Promise<Expense[]> {
        return this.db.expenses;
    }

    async create(expense: Omit<Expense, 'id'> & { createdBy?: string; invitedUsers?: Array<{ name: string; mobile?: string }> }): Promise<Expense> {
        // Create invited users if they're provided
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

        // Also check for any users in splitBetween that don't exist yet
        for (const userId of expense.splitBetween) {
            const userExists = await this.usersService.findOneById(userId);
            if (!userExists) {
                console.warn(`User ${userId} in splitBetween does not exist`);
            }
        }

        const newExpense = {
            ...expense,
            id: Math.random().toString(36).substring(2, 9),
        } as Expense;
        // Remove invitedUsers from the saved expense data
        delete (newExpense as any).invitedUsers;
        
        this.db.expenses.push(newExpense);
        this.saveDb();

        // Trigger push notifications, passing the creator ID
        this.triggerPushNotifications(newExpense, expense.createdBy);

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
        return this.db.expenses.filter(e => e.paidBy === userId || e.splitBetween.includes(userId));
    }

    async findByGroupId(groupId: string): Promise<Expense[]> {
        return this.db.expenses.filter(e => e.groupId === groupId);
    }
}
