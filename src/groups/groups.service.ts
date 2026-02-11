import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Group } from './group.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class GroupsService implements OnModuleInit {
    private readonly dbPath = path.join(process.cwd(), 'db.json');
    private db: { users: any[]; expenses: any[]; groups: Group[] } = { users: [], expenses: [], groups: [] };

    constructor(private readonly usersService: UsersService) { }

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
                    groups: parsed.groups || [],
                };
            } else {
                this.saveDb();
            }
        } catch (error) {
            console.error('Error loading db.json:', error);
            this.db = { users: [], expenses: [], groups: [] };
        }
    }

    private saveDb() {
        try {
            let diskDb: any = { users: [], expenses: [], groups: [] };
            if (fs.existsSync(this.dbPath)) {
                try {
                    const data = fs.readFileSync(this.dbPath, 'utf8');
                    diskDb = JSON.parse(data);
                } catch (e) {
                    console.error('Error reading db.json before save:', e);
                }
            }

            const mergedDb = {
                ...diskDb,
                groups: this.db.groups,
                expenses: this.db.expenses,
            };
            fs.writeFileSync(this.dbPath, JSON.stringify(mergedDb, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving db.json:', error);
        }
    }

    async findAll(userId?: string): Promise<Group[]> {
        if (!userId) return this.db.groups;
        return this.db.groups.filter(g => g.createdBy === userId || g.members.includes(userId));
    }

    async create(data: Omit<Group, 'id' | 'createdAt'> & { invitedUsers?: Array<{ name: string; mobile?: string }> }): Promise<Group> {
        const trimmedName = data.name?.trim();
        if (!trimmedName) {
            throw new BadRequestException('Group name should not be empty');
        }

        if (data.invitedUsers && data.invitedUsers.length > 0) {
            for (const invitedUserData of data.invitedUsers) {
                try {
                    const invitedUser = await this.usersService.createInvitedUser({
                        name: invitedUserData.name,
                        mobile: invitedUserData.mobile,
                    });
                    if (!data.members.includes(invitedUser.id)) {
                        data.members.push(invitedUser.id);
                    }
                } catch (error) {
                    console.error('Error creating invited user during group creation:', error);
                }
            }
        }

        const uniqueMembers = Array.from(new Set(data.members));
        const newGroup: Group = {
            id: Math.random().toString(36).substring(2, 9),
            name: trimmedName,
            createdBy: data.createdBy,
            members: uniqueMembers,
            createdAt: new Date().toISOString(),
        };

        this.db.groups.push(newGroup);
        this.saveDb();
        return newGroup;
    }

    async update(
        id: string,
        data: Partial<Pick<Group, 'name' | 'members'>> & { invitedUsers?: Array<{ name: string; mobile?: string }> },
        userId?: string,
    ): Promise<Group> {
        const group = this.db.groups.find(item => item.id === id);
        if (!group) {
            throw new NotFoundException('Group not found');
        }

        if (!userId || group.createdBy !== userId) {
            throw new ForbiddenException('Only group creator can edit this group');
        }

        if (typeof data.name === 'string') {
            const trimmedName = data.name.trim();
            if (!trimmedName) {
                throw new BadRequestException('Group name should not be empty');
            }
            group.name = trimmedName;
        }

        const nextMembers = Array.isArray(data.members)
            ? [...data.members]
            : [...group.members];

        if (data.invitedUsers && data.invitedUsers.length > 0) {
            for (const invitedUserData of data.invitedUsers) {
                try {
                    const invitedUser = await this.usersService.createInvitedUser({
                        name: invitedUserData.name,
                        mobile: invitedUserData.mobile,
                    });
                    if (!nextMembers.includes(invitedUser.id)) {
                        nextMembers.push(invitedUser.id);
                    }
                } catch (error) {
                    console.error('Error creating invited user during group update:', error);
                }
            }
        }

        group.members = Array.from(new Set(nextMembers.filter(Boolean)));
        this.saveDb();
        return group;
    }

    async remove(id: string, userId?: string): Promise<{ success: true; deletedGroupId: string; deletedExpensesCount: number }> {
        const groupIndex = this.db.groups.findIndex(group => group.id === id);
        if (groupIndex === -1) {
            throw new NotFoundException('Group not found');
        }

        const group = this.db.groups[groupIndex];
        if (!userId || group.createdBy !== userId) {
            throw new ForbiddenException('Only group creator can delete this group');
        }

        this.db.groups.splice(groupIndex, 1);

        const previousExpenseCount = this.db.expenses.length;
        this.db.expenses = this.db.expenses.filter(expense => expense.groupId !== id);
        const deletedExpensesCount = previousExpenseCount - this.db.expenses.length;

        this.saveDb();

        return {
            success: true,
            deletedGroupId: id,
            deletedExpensesCount,
        };
    }
}
