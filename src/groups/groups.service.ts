import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Group } from './group.entity';
import { UsersService } from '../users/users.service';
import { DbService } from '../common/db/db.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

@Injectable()
export class GroupsService {
    constructor(
        private readonly usersService: UsersService,
        private readonly dbService: DbService,
    ) { }

    async findAll(userId: string): Promise<Group[]> {
        const db = await this.dbService.readDb();
        return (db.groups as Group[]).filter(g => g.createdBy === userId || g.members.includes(userId));
    }

    async create(
        data: CreateGroupDto,
        userId: string,
    ): Promise<Group> {
        const trimmedName = data.name?.trim();
        if (!trimmedName) {
            throw new BadRequestException('Group name should not be empty');
        }

        const memberIds = [...data.members];
        if (data.invitedUsers && data.invitedUsers.length > 0) {
            for (const invitedUserData of data.invitedUsers) {
                const invitedUser = await this.usersService.createInvitedUser({
                    name: invitedUserData.name,
                    mobile: invitedUserData.mobile,
                });
                if (!memberIds.includes(invitedUser.id)) {
                    memberIds.push(invitedUser.id);
                }
            }
        }

        if (!memberIds.includes(userId)) {
            memberIds.push(userId);
        }

        const uniqueMembers = Array.from(new Set(memberIds));
        for (const memberId of uniqueMembers) {
            const member = await this.usersService.findOneById(memberId);
            if (!member) {
                throw new NotFoundException(`Member ${memberId} not found`);
            }
        }

        const newGroup: Group = {
            id: randomUUID(),
            name: trimmedName,
            createdBy: userId,
            members: uniqueMembers,
            createdAt: new Date().toISOString(),
        };

        await this.dbService.updateDb((db) => {
            (db.groups as Group[]).push(newGroup);
        });

        return newGroup;
    }

    async update(
        id: string,
        data: UpdateGroupDto,
        userId: string,
    ): Promise<Group> {
        if (data.invitedUsers && data.invitedUsers.length > 0) {
            const pendingInvitedUsers: string[] = [];
            for (const invitedUserData of data.invitedUsers) {
                const invitedUser = await this.usersService.createInvitedUser({
                    name: invitedUserData.name,
                    mobile: invitedUserData.mobile,
                });
                pendingInvitedUsers.push(invitedUser.id);
            }
            data.members = [...(data.members || []), ...pendingInvitedUsers];
        }

        let updatedGroup!: Group;
        await this.dbService.updateDb((db) => {
            const groups = db.groups as Group[];
            const group = groups.find(item => item.id === id);
            if (!group) {
                throw new NotFoundException('Group not found');
            }

            if (group.createdBy !== userId) {
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
                ? [...group.members, ...data.members]
                : [...group.members];

            if (!nextMembers.includes(group.createdBy)) {
                nextMembers.push(group.createdBy);
            }

            group.members = Array.from(new Set(nextMembers.filter(Boolean)));

            for (const memberId of group.members) {
                const member = db.users.find((user: { id: string }) => user.id === memberId);
                if (!member) {
                    throw new NotFoundException(`Member ${memberId} not found`);
                }
            }
            updatedGroup = group;
        });

        return updatedGroup;
    }

    async remove(id: string, userId: string): Promise<{ success: true; deletedGroupId: string; deletedExpensesCount: number }> {
        let result!: { success: true; deletedGroupId: string; deletedExpensesCount: number };

        await this.dbService.updateDb((db) => {
            const groups = db.groups as Group[];
            const expenses = db.expenses as Array<{ groupId?: string }>;
            const groupIndex = groups.findIndex(group => group.id === id);
            if (groupIndex === -1) {
                throw new NotFoundException('Group not found');
            }

            const group = groups[groupIndex];
            if (group.createdBy !== userId) {
                throw new ForbiddenException('Only group creator can delete this group');
            }

            groups.splice(groupIndex, 1);

            const previousExpenseCount = expenses.length;
            db.expenses = expenses.filter(expense => expense.groupId !== id);
            const deletedExpensesCount = previousExpenseCount - db.expenses.length;

            result = {
                success: true,
                deletedGroupId: id,
                deletedExpensesCount,
            };
        });

        return result;
    }
}
