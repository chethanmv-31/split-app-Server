import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Expense } from './expense.entity';
import { UsersService } from '../users/users.service';
import { PushNotificationService } from '../common/push-notifications.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Settlement } from './settlement.entity';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { SupabaseService } from '../common/supabase/supabase.service';

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

@Injectable()
export class ExpensesService {
    constructor(
        private usersService: UsersService,
        private pushNotificationService: PushNotificationService,
        private supabaseService: SupabaseService,
    ) { }

    async findAll(userId: string): Promise<Expense[]> {
        return this.listExpensesFromSupabaseForUser(userId);
    }

    private async assertSupabaseOk(response: Response): Promise<void> {
        if (response.ok) return;
        const details = await response.text();
        throw new BadRequestException(`Supabase query failed: ${response.status} ${details}`);
    }

    private mapExpenseRow(row: any): Expense {
        return {
            id: row.id,
            title: row.title,
            amount: Number(row.amount),
            date: row.date,
            category: row.category,
            receiptUrl: row.receipt_url || undefined,
            groupId: row.group_id || undefined,
            paidBy: row.paid_by,
            splitType: row.split_type,
            splitBetween: Array.isArray(row.split_between) ? row.split_between : [],
            splitDetails: Array.isArray(row.split_details) ? row.split_details : undefined,
        };
    }

    private toExpenseRow(expense: Omit<Expense, 'id'> & { id?: string }) {
        return {
            ...(expense.id ? { id: expense.id } : {}),
            title: expense.title,
            amount: Number(expense.amount),
            date: expense.date,
            category: expense.category,
            receipt_url: expense.receiptUrl || null,
            group_id: expense.groupId || null,
            paid_by: expense.paidBy,
            split_type: expense.splitType,
            split_between: expense.splitBetween,
            split_details: expense.splitDetails || null,
            updated_at: new Date().toISOString(),
        };
    }

    private mapSettlementRow(row: any): Settlement {
        return {
            id: row.id,
            fromUserId: row.from_user_id,
            toUserId: row.to_user_id,
            amount: Number(row.amount),
            settledAt: row.settled_at,
            createdAt: row.created_at,
            createdBy: row.created_by,
            groupId: row.group_id || undefined,
            note: row.note || undefined,
        };
    }

    private toSettlementRow(settlement: Settlement) {
        return {
            id: settlement.id,
            from_user_id: settlement.fromUserId,
            to_user_id: settlement.toUserId,
            amount: Number(settlement.amount),
            settled_at: settlement.settledAt,
            created_at: settlement.createdAt,
            created_by: settlement.createdBy,
            group_id: settlement.groupId || null,
            note: settlement.note || null,
        };
    }

    private async listExpensesFromSupabaseForUser(userId: string): Promise<Expense[]> {
        const encodedUser = encodeURIComponent(userId);
        const containsExpr = encodeURIComponent(`{${userId}}`);
        const [paidByRes, splitRes] = await Promise.all([
            this.supabaseService.rest(`expenses?select=*&paid_by=eq.${encodedUser}`),
            this.supabaseService.rest(`expenses?select=*&split_between=cs.${containsExpr}`),
        ]);
        await this.assertSupabaseOk(paidByRes);
        await this.assertSupabaseOk(splitRes);
        const [paidRows, splitRows] = await Promise.all([paidByRes.json(), splitRes.json()]);
        const combined = [...(paidRows || []), ...(splitRows || [])];
        const unique = new Map<string, Expense>();
        combined.forEach((row: any) => {
            const mapped = this.mapExpenseRow(row);
            unique.set(mapped.id, mapped);
        });
        return Array.from(unique.values());
    }

    private async findExpenseByIdFromSupabase(id: string): Promise<Expense | undefined> {
        const response = await this.supabaseService.rest(`expenses?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
        await this.assertSupabaseOk(response);
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length === 0) return undefined;
        return this.mapExpenseRow(rows[0]);
    }

    private async listExpensesByGroupFromSupabase(groupId: string): Promise<Expense[]> {
        const response = await this.supabaseService.rest(`expenses?select=*&group_id=eq.${encodeURIComponent(groupId)}`);
        await this.assertSupabaseOk(response);
        const rows = await response.json();
        return Array.isArray(rows) ? rows.map((row) => this.mapExpenseRow(row)) : [];
    }

    private async listSettlementsFromSupabaseForUser(userId: string): Promise<Settlement[]> {
        const encodedUser = encodeURIComponent(userId);
        const [fromRes, toRes] = await Promise.all([
            this.supabaseService.rest(`settlements?select=*&from_user_id=eq.${encodedUser}`),
            this.supabaseService.rest(`settlements?select=*&to_user_id=eq.${encodedUser}`),
        ]);
        await this.assertSupabaseOk(fromRes);
        await this.assertSupabaseOk(toRes);
        const [fromRows, toRows] = await Promise.all([fromRes.json(), toRes.json()]);
        const unique = new Map<string, Settlement>();
        [...(fromRows || []), ...(toRows || [])].forEach((row: any) => {
            const mapped = this.mapSettlementRow(row);
            unique.set(mapped.id, mapped);
        });
        return Array.from(unique.values());
    }

    private mapGroupRow(row: any): { id: string; name: string; members: string[] } {
        return {
            id: row.id,
            name: row.name,
            members: Array.isArray(row.members) ? row.members : [],
        };
    }

    private async listGroupsFromSource(): Promise<Array<{ id: string; name: string; members: string[] }>> {
        const response = await this.supabaseService.rest('groups?select=*');
        await this.assertSupabaseOk(response);
        const rows = await response.json();
        return Array.isArray(rows) ? rows.map((row) => this.mapGroupRow(row)) : [];
    }

    private async findGroupFromSource(groupId: string): Promise<{ id: string; name: string; members: string[] } | undefined> {
        const response = await this.supabaseService.rest(`groups?select=*&id=eq.${encodeURIComponent(groupId)}&limit=1`);
        await this.assertSupabaseOk(response);
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length === 0) return undefined;
        return this.mapGroupRow(rows[0]);
    }

    private async maybeUploadReceiptForSupabase(
        expenseId: string,
        ownerUserId: string,
        receiptUrl?: string,
    ): Promise<string | undefined> {
        if (!receiptUrl) return receiptUrl;
        const trimmed = receiptUrl.trim();
        if (!trimmed) return undefined;
        if (!trimmed.startsWith('data:')) return trimmed;

        const mimeMatch = trimmed.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch?.[1] || 'image/jpeg';
        const extension = mimeType === 'image/png'
            ? 'png'
            : mimeType === 'image/webp'
                ? 'webp'
                : 'jpg';
        const objectPath = `${ownerUserId}/expenses/${expenseId}/receipt-${Date.now()}.${extension}`;
        return this.supabaseService.uploadBase64Object({
            bucket: 'receipts',
            objectPath,
            dataUrl: trimmed,
            upsert: true,
            allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
            maxBytes: MAX_RECEIPT_BYTES,
        });
    }

    private isWithinRange(date: Date, timeFilter: '30D' | '90D' | 'ALL' = 'ALL'): boolean {
        if (timeFilter === 'ALL') return true;
        const days = timeFilter === '30D' ? 30 : 90;
        const since = Date.now() - days * 24 * 60 * 60 * 1000;
        return date.getTime() >= since;
    }

    private computeShareForUser(expense: Expense, userId: string): number {
        if (expense.splitType === 'EQUAL') {
            const count = expense.splitBetween?.length || 0;
            if (count <= 0) return 0;
            return expense.splitBetween.includes(userId) ? expense.amount / count : 0;
        }
        const detail = expense.splitDetails?.find((item) => item.userId === userId);
        return detail?.amount || 0;
    }

    private applyExpenseBalanceImpact(expense: Expense, userId: string, state: { youOwe: number; owesYou: number; totalSpent: number }) {
        const isPaidByMe = expense.paidBy === userId;
        const isInSplit = expense.splitBetween.includes(userId);

        if (isPaidByMe) {
            state.totalSpent += Number(expense.amount) || 0;
            if (expense.splitType === 'EQUAL') {
                const count = expense.splitBetween.length;
                if (count > 0) {
                    const share = expense.amount / count;
                    state.owesYou += isInSplit ? share * (count - 1) : expense.amount;
                }
            } else {
                state.owesYou += (expense.splitDetails || []).reduce((acc, detail) => {
                    if (detail.userId === userId) return acc;
                    return acc + (detail.amount || 0);
                }, 0);
            }
            return;
        }

        if (isInSplit) {
            state.youOwe += this.computeShareForUser(expense, userId);
        }
    }

    private applySettlementBalanceImpact(settlement: Settlement, userId: string, state: { youOwe: number; owesYou: number }) {
        if (settlement.fromUserId === userId) {
            state.youOwe = Math.max(0, state.youOwe - settlement.amount);
        }
        if (settlement.toUserId === userId) {
            state.owesYou = Math.max(0, state.owesYou - settlement.amount);
        }
    }

    private async normalizeExpensePayload(
        payload: CreateExpenseDto | UpdateExpenseDto,
        createdBy: string,
        existingExpense?: Expense,
    ): Promise<Omit<Expense, 'id'>> {
        const baseData = existingExpense
            ? {
                ...existingExpense,
                ...payload,
            }
            : { ...payload };
        const payerId = (baseData.paidBy || '').trim() || createdBy;
        const splitBetween = Array.isArray(baseData.splitBetween)
            ? baseData.splitBetween
            : existingExpense?.splitBetween || [];

        if (!Array.isArray(splitBetween) || splitBetween.length === 0) {
            throw new BadRequestException('splitBetween must contain at least one user');
        }

        const invitedUserIds: string[] = [];
        if (Array.isArray(payload.invitedUsers) && payload.invitedUsers.length > 0) {
            for (const invitedUserData of payload.invitedUsers) {
                const invitedUser = await this.usersService.createInvitedUser({
                    name: invitedUserData.name,
                    mobile: invitedUserData.mobile,
                });
                invitedUserIds.push(invitedUser.id);
            }
        }

        const uniqueSplitUsers = Array.from(new Set([...splitBetween, ...invitedUserIds]));
        const groupId = baseData.groupId;
        if (groupId) {
            const group = await this.findGroupFromSource(groupId);
            if (!group) {
                throw new NotFoundException('Group not found');
            }
            if (!group.members.includes(createdBy)) {
                throw new ForbiddenException('You are not a member of this group');
            }
            if (!group.members.includes(payerId)) {
                throw new ForbiddenException('Payer must be a member of this group');
            }
            const nonMembers = uniqueSplitUsers.filter((userId) => !group.members.includes(userId));
            if (nonMembers.length > 0) {
                throw new ForbiddenException('All splitBetween users must be members of the group');
            }
        }

        for (const userId of uniqueSplitUsers) {
            const userExists = await this.usersService.findOneById(userId);
            if (!userExists) {
                throw new NotFoundException(`User ${userId} not found`);
            }
        }
        const payerExists = await this.usersService.findOneById(payerId);
        if (!payerExists) {
            throw new NotFoundException(`User ${payerId} not found`);
        }

        const amount = Number(baseData.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new BadRequestException('amount must be greater than zero');
        }
        const title = String(baseData.title || '').trim();
        if (!title) {
            throw new BadRequestException('title must not be empty');
        }
        const category = String(baseData.category || '').trim();
        if (!category) {
            throw new BadRequestException('category must not be empty');
        }
        const dateIso = String(baseData.date || '');
        if (!dateIso || Number.isNaN(new Date(dateIso).getTime())) {
            throw new BadRequestException('date must be a valid ISO date');
        }

        let normalizedSplitDetails: Expense['splitDetails'] | undefined;
        if (baseData.splitType === 'EQUAL') {
            normalizedSplitDetails = undefined;
        } else {
            if (!Array.isArray(baseData.splitDetails) || baseData.splitDetails.length === 0) {
                throw new BadRequestException('splitDetails are required for UNEQUAL split');
            }

            const detailsByUserId = new Map<string, number>();
            for (const detail of baseData.splitDetails) {
                const detailUserId = detail.userId?.trim();
                if (!detailUserId) {
                    throw new BadRequestException('Each splitDetails entry must include userId');
                }
                if (detailsByUserId.has(detailUserId)) {
                    throw new BadRequestException(`Duplicate split detail for user ${detailUserId}`);
                }
                if (!uniqueSplitUsers.includes(detailUserId)) {
                    throw new BadRequestException(`splitDetails user ${detailUserId} must be in splitBetween`);
                }
                detailsByUserId.set(detailUserId, Number(detail.amount) || 0);
            }

            const missingUsers = uniqueSplitUsers.filter((userId) => !detailsByUserId.has(userId));
            if (missingUsers.length > 0) {
                throw new BadRequestException(`Missing splitDetails for users: ${missingUsers.join(', ')}`);
            }

            normalizedSplitDetails = uniqueSplitUsers.map((userId) => ({
                userId,
                amount: detailsByUserId.get(userId) || 0,
            }));
            const splitTotal = normalizedSplitDetails.reduce((sum, detail) => sum + detail.amount, 0);
            if (Math.abs(splitTotal - amount) > 0.01) {
                throw new BadRequestException('Sum of splitDetails must equal expense amount');
            }
        }

        return {
            title,
            amount,
            date: dateIso,
            category,
            receiptUrl: baseData.receiptUrl?.trim() || undefined,
            groupId: groupId || undefined,
            paidBy: payerId,
            splitType: baseData.splitType as 'EQUAL' | 'UNEQUAL',
            splitBetween: uniqueSplitUsers,
            splitDetails: normalizedSplitDetails,
        };
    }

    async create(expense: CreateExpenseDto, createdBy: string): Promise<Expense> {
        const normalized = await this.normalizeExpensePayload(expense, createdBy);
        const newExpenseId = randomUUID();
        const uploadedReceiptUrl = await this.maybeUploadReceiptForSupabase(newExpenseId, normalized.paidBy, normalized.receiptUrl);
        const newExpense: Expense = {
            ...normalized,
            receiptUrl: uploadedReceiptUrl,
            id: newExpenseId,
        };

        const response = await this.supabaseService.rest('expenses', {
            method: 'POST',
            body: JSON.stringify(this.toExpenseRow(newExpense)),
        });
        await this.assertSupabaseOk(response);

        this.triggerPushNotifications(newExpense, createdBy);
        return newExpense;
    }

    async update(id: string, updates: UpdateExpenseDto, userId: string): Promise<Expense> {
        const existing = await this.findExpenseByIdFromSupabase(id);
        if (!existing) {
            throw new NotFoundException('Expense not found');
        }
        if (existing.paidBy !== userId) {
            throw new ForbiddenException('Only the payer can update this expense');
        }

        const normalized = await this.normalizeExpensePayload(updates, userId, existing);
        const updatedExpense: Expense = {
            ...existing,
            ...normalized,
            id,
        };
        updatedExpense.receiptUrl = await this.maybeUploadReceiptForSupabase(id, existing.paidBy, normalized.receiptUrl);
        const response = await this.supabaseService.rest(`expenses?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(this.toExpenseRow(updatedExpense)),
        });
        await this.assertSupabaseOk(response);

        return updatedExpense;
    }

    async remove(id: string, userId: string): Promise<{ success: true; deletedExpenseId: string }> {
        const existing = await this.findExpenseByIdFromSupabase(id);
        if (!existing) {
            throw new NotFoundException('Expense not found');
        }
        if (existing.paidBy !== userId) {
            throw new ForbiddenException('Only the payer can delete this expense');
        }

        const response = await this.supabaseService.rest(`expenses?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
        });
        await this.assertSupabaseOk(response);

        return { success: true, deletedExpenseId: id };
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
        return this.listExpensesFromSupabaseForUser(userId);
    }

    async findByGroupId(groupId: string, userId: string): Promise<Expense[]> {
        const group = await this.findGroupFromSource(groupId);
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        if (!group.members.includes(userId)) {
            throw new ForbiddenException('You are not a member of this group');
        }
        return this.listExpensesByGroupFromSupabase(groupId);
    }

    async createSettlement(payload: CreateSettlementDto, createdBy: string): Promise<Settlement> {
        if (payload.fromUserId === payload.toUserId) {
            throw new BadRequestException('fromUserId and toUserId must be different');
        }

        const [fromUser, toUser] = await Promise.all([
            this.usersService.findOneById(payload.fromUserId),
            this.usersService.findOneById(payload.toUserId),
        ]);
        if (!fromUser || !toUser) {
            throw new NotFoundException('Settlement users not found');
        }

        if (payload.groupId) {
            const group = await this.findGroupFromSource(payload.groupId);
            if (!group) throw new NotFoundException('Group not found');
            if (!group.members.includes(createdBy)) {
                throw new ForbiddenException('You are not a member of this group');
            }
            if (!group.members.includes(payload.fromUserId) || !group.members.includes(payload.toUserId)) {
                throw new ForbiddenException('Settlement users must be group members');
            }
        } else if (createdBy !== payload.fromUserId && createdBy !== payload.toUserId) {
            throw new ForbiddenException('Only settlement participants can create personal settlements');
        }

        const nowIso = new Date().toISOString();
        const settlement: Settlement = {
            id: randomUUID(),
            fromUserId: payload.fromUserId,
            toUserId: payload.toUserId,
            amount: Number(payload.amount),
            settledAt: payload.settledAt || nowIso,
            createdAt: nowIso,
            createdBy,
            groupId: payload.groupId || undefined,
            note: payload.note?.trim() || undefined,
        };

        const response = await this.supabaseService.rest('settlements', {
            method: 'POST',
            body: JSON.stringify(this.toSettlementRow(settlement)),
        });
        await this.assertSupabaseOk(response);

        return settlement;
    }

    async findSettlements(userId: string, groupId?: string): Promise<Settlement[]> {
        const settlements = await this.listSettlementsFromSupabaseForUser(userId);
        if (!groupId) return settlements;

        const group = await this.findGroupFromSource(groupId);
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        if (!group.members.includes(userId)) {
            throw new ForbiddenException('You are not a member of this group');
        }
        return settlements.filter((item) => item.groupId === groupId);
    }

    async getAnalyticsSummary(
        userId: string,
        options?: { groupId?: string; timeFilter?: '30D' | '90D' | 'ALL' },
    ): Promise<{
        youOwe: number;
        owesYou: number;
        totalSpent: number;
        transactionCount: number;
        categoryTotals: Record<string, number>;
        groupTotals: Record<string, number>;
        dailyTotals: Record<string, number>;
        monthlyTotals: Record<string, number>;
        settlementTotals: { paid: number; received: number; net: number };
    }> {
        const timeFilter = options?.timeFilter || 'ALL';
        const groups = await this.listGroupsFromSource();
        const groupsById = groups.reduce((acc, group) => {
            acc[group.id] = group;
            return acc;
        }, {} as Record<string, { id: string; name: string; members: string[] }>);

        if (options?.groupId) {
            const group = groupsById[options.groupId];
            if (!group) {
                throw new NotFoundException('Group not found');
            }
            if (!group.members.includes(userId)) {
                throw new ForbiddenException('You are not a member of this group');
            }
        }

        const sourceExpenses = await this.listExpensesFromSupabaseForUser(userId);
        const filteredExpenses = sourceExpenses.filter((expense) => {
            if (!(expense.paidBy === userId || expense.splitBetween.includes(userId))) return false;
            if (options?.groupId && expense.groupId !== options.groupId) return false;
            const dateObj = new Date(expense.date);
            if (Number.isNaN(dateObj.getTime())) return false;
            return this.isWithinRange(dateObj, timeFilter);
        });

        const summary = {
            youOwe: 0,
            owesYou: 0,
            totalSpent: 0,
            transactionCount: filteredExpenses.length,
            categoryTotals: {} as Record<string, number>,
            groupTotals: {} as Record<string, number>,
            dailyTotals: {} as Record<string, number>,
            monthlyTotals: {} as Record<string, number>,
            settlementTotals: { paid: 0, received: 0, net: 0 },
        };

        filteredExpenses.forEach((expense) => {
            this.applyExpenseBalanceImpact(expense, userId, summary);
            const amount = Number(expense.amount) || 0;
            const dateObj = new Date(expense.date);
            const category = expense.category || 'Others';
            const groupLabel = expense.groupId ? (groupsById[expense.groupId]?.name || 'Unnamed Group') : 'Personal';
            const dayKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

            summary.categoryTotals[category] = (summary.categoryTotals[category] || 0) + amount;
            summary.groupTotals[groupLabel] = (summary.groupTotals[groupLabel] || 0) + amount;
            summary.dailyTotals[dayKey] = (summary.dailyTotals[dayKey] || 0) + amount;
            summary.monthlyTotals[monthKey] = (summary.monthlyTotals[monthKey] || 0) + amount;
        });

        const sourceSettlements = await this.listSettlementsFromSupabaseForUser(userId);
        const relevantSettlements = sourceSettlements.filter((settlement) => {
            if (!(settlement.fromUserId === userId || settlement.toUserId === userId)) return false;
            if (options?.groupId && settlement.groupId !== options.groupId) return false;
            const dateObj = new Date(settlement.settledAt || settlement.createdAt);
            if (Number.isNaN(dateObj.getTime())) return false;
            return this.isWithinRange(dateObj, timeFilter);
        });

        relevantSettlements.forEach((settlement) => {
            this.applySettlementBalanceImpact(settlement, userId, summary);
            if (settlement.fromUserId === userId) {
                summary.settlementTotals.paid += settlement.amount;
                summary.settlementTotals.net -= settlement.amount;
            }
            if (settlement.toUserId === userId) {
                summary.settlementTotals.received += settlement.amount;
                summary.settlementTotals.net += settlement.amount;
            }
        });

        return summary;
    }
}
