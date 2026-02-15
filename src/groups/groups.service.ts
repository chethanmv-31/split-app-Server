import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Group } from './group.entity';
import { UsersService } from '../users/users.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class GroupsService {
    constructor(
        private readonly usersService: UsersService,
        private readonly supabaseService: SupabaseService,
    ) { }

    private async assertSupabaseOk(response: Response): Promise<void> {
        if (response.ok) return;
        const details = await response.text();
        throw new BadRequestException(`Supabase query failed: ${response.status} ${details}`);
    }

    private mapGroupRow(row: any): Group {
        return {
            id: row.id,
            name: row.name,
            createdBy: row.created_by,
            members: Array.isArray(row.members) ? row.members : [],
            createdAt: row.created_at,
        };
    }

    private toGroupRow(group: Group) {
        return {
            id: group.id,
            name: group.name,
            created_by: group.createdBy,
            members: group.members,
            created_at: group.createdAt,
            updated_at: new Date().toISOString(),
        };
    }

    private async findGroupById(groupId: string): Promise<Group | undefined> {
        const response = await this.supabaseService.rest(`groups?select=*&id=eq.${encodeURIComponent(groupId)}&limit=1`);
        await this.assertSupabaseOk(response);
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length === 0) return undefined;
        return this.mapGroupRow(rows[0]);
    }

    async findAll(userId: string): Promise<Group[]> {
        const response = await this.supabaseService.rest('groups?select=*');
        await this.assertSupabaseOk(response);
        const rows = await response.json();
        const allGroups = Array.isArray(rows) ? rows.map((row) => this.mapGroupRow(row)) : [];
        return allGroups.filter((group) => group.createdBy === userId || group.members.includes(userId));
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

        const response = await this.supabaseService.rest('groups', {
            method: 'POST',
            body: JSON.stringify(this.toGroupRow(newGroup)),
        });
        await this.assertSupabaseOk(response);

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

        const group = await this.findGroupById(id);
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
            const member = await this.usersService.findOneById(memberId);
            if (!member) {
                throw new NotFoundException(`Member ${memberId} not found`);
            }
        }

        const updatedGroup = group;
        const response = await this.supabaseService.rest(`groups?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                name: updatedGroup.name,
                members: updatedGroup.members,
                updated_at: new Date().toISOString(),
            }),
        });
        await this.assertSupabaseOk(response);

        return updatedGroup;
    }

    async remove(id: string, userId: string): Promise<{ success: true; deletedGroupId: string; deletedExpensesCount: number }> {
        const group = await this.findGroupById(id);
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        if (group.createdBy !== userId) {
            throw new ForbiddenException('Only group creator can delete this group');
        }

        const countRes = await this.supabaseService.rest(`expenses?select=id&group_id=eq.${encodeURIComponent(id)}`);
        await this.assertSupabaseOk(countRes);
        const rows = await countRes.json();
        const deletedExpensesCount = Array.isArray(rows) ? rows.length : 0;

        const deleteExpensesRes = await this.supabaseService.rest(`expenses?group_id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
        });
        await this.assertSupabaseOk(deleteExpensesRes);

        const deleteGroupRes = await this.supabaseService.rest(`groups?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
        });
        await this.assertSupabaseOk(deleteGroupRes);

        return {
            success: true,
            deletedGroupId: id,
            deletedExpensesCount,
        };
    }
}
