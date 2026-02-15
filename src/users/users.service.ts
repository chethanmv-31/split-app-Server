import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../common/supabase/supabase.service';

const normalizePhone = (phone?: string): string | undefined => {
    if (!phone) return phone;
    const cleaned = phone.trim().replace(/[^\d+]/g, '');
    if (!cleaned) return undefined;
    if (cleaned.startsWith('+')) {
        return `+${cleaned.slice(1).replace(/\D/g, '')}`;
    }
    return cleaned.replace(/\D/g, '');
};

const phoneLookupKey = (phone?: string): string | undefined => {
    const normalized = normalizePhone(phone);
    if (!normalized) return undefined;
    return normalized.replace(/\D/g, '');
};

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export interface User {
    id: string;
    name: string;
    email?: string;
    password?: string;
    passwordHash?: string;
    mobile?: string;
    avatar?: string;
    pushToken?: string;
    [key: string]: string | undefined;
}

@Injectable()
export class UsersService {
    constructor(
        private readonly supabaseService: SupabaseService,
    ) { }

    private async assertSupabaseOk(response: Response): Promise<void> {
        if (response.ok) return;
        const details = await response.text();
        throw new Error(`Supabase users query failed: ${response.status} ${details}`);
    }

    private mapRowToUser(row: any): User {
        return {
            id: row.id,
            name: row.name,
            email: row.email || undefined,
            mobile: row.mobile || undefined,
            passwordHash: row.password_hash || undefined,
            avatar: row.avatar || undefined,
            pushToken: row.push_token || undefined,
        };
    }

    private toInsertRow(user: Partial<User> & { id: string; name: string }) {
        return {
            id: user.id,
            name: user.name,
            email: user.email || null,
            mobile: user.mobile || null,
            password_hash: user.passwordHash || null,
            avatar: user.avatar || null,
            push_token: user.pushToken || null,
        };
    }

    private async fetchAllUsersFromSupabase(): Promise<User[]> {
        const response = await this.supabaseService.rest('users?select=*');
        await this.assertSupabaseOk(response);
        const rows = await response.json();
        return Array.isArray(rows) ? rows.map((row) => this.mapRowToUser(row)) : [];
    }

    async findAll(): Promise<User[]> {
        return this.fetchAllUsersFromSupabase();
    }

    async findOneByMobile(mobile: string): Promise<User | undefined> {
        const normalizedMobile = phoneLookupKey(mobile);
        const users = await this.findAll();
        return users.find((user: User) => phoneLookupKey(user.mobile) === normalizedMobile);
    }

    async findOneByEmail(email: string): Promise<User | undefined> {
        const normalizedEmail = email.trim().toLowerCase();
        const users = await this.findAll();
        return users.find((user: User) => user.email?.trim().toLowerCase() === normalizedEmail);
    }

    private async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    private async maybeUploadAvatarForSupabase(id: string, avatar?: string): Promise<string | undefined> {
        if (!avatar) return avatar;
        const trimmed = avatar.trim();
        if (!trimmed) return undefined;
        if (!trimmed.startsWith('data:')) return trimmed;

        const mimeMatch = trimmed.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch?.[1] || 'image/jpeg';
        const extension = mimeType === 'image/png'
            ? 'png'
            : mimeType === 'image/webp'
                ? 'webp'
                : 'jpg';
        const objectPath = `${id}/avatar-${Date.now()}.${extension}`;
        return this.supabaseService.uploadBase64Object({
            bucket: 'avatars',
            objectPath,
            dataUrl: trimmed,
            upsert: true,
            allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
            maxBytes: MAX_AVATAR_BYTES,
        });
    }

    private async checkPassword(password: string, user: User): Promise<boolean> {
        if (!user.passwordHash) return false;
        return bcrypt.compare(password, user.passwordHash);
    }

    async validateCredentials(email: string, password: string): Promise<User | undefined> {
        const user = await this.findOneByEmail(email);
        if (!user) return undefined;
        const isValid = await this.checkPassword(password, user);
        if (!isValid) return undefined;
        return user;
    }

    async findByQuery(query: Partial<User> | Record<string, unknown>): Promise<User[]> {
        const users = await this.findAll();
        const safeQuery: Record<string, unknown> = { ...query };
        delete safeQuery.password;
        delete safeQuery.passwordHash;

        return users.filter((user: User) => {
            return Object.entries(safeQuery).every(([key, value]) => {
                if (value === undefined) return true;
                if (key === 'password' || key === 'passwordHash') return false;
                return user[key] === value;
            });
        });
    }

    async findOneById(id: string): Promise<User | undefined> {
        const users = await this.findAll();
        return users.find((user: User) => user.id === id);
    }

    async createInvitedUser(userData: { name: string; mobile?: string }): Promise<User> {
        const normalizedMobile = normalizePhone(userData.mobile);
        const users = await this.fetchAllUsersFromSupabase();
        if (normalizedMobile) {
            const existingUser = users.find(
                (entry: User) => phoneLookupKey(entry.mobile) === phoneLookupKey(normalizedMobile),
            );
            if (existingUser) {
                const patchRes = await this.supabaseService.rest(`users?id=eq.${encodeURIComponent(existingUser.id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ name: userData.name }),
                });
                await this.assertSupabaseOk(patchRes);
                return { ...existingUser, name: userData.name };
            }
        }

        const invitedUser: User = {
            name: userData.name,
            mobile: normalizedMobile,
            id: randomUUID(),
        } as User;

        const insertRes = await this.supabaseService.rest('users', {
            method: 'POST',
            body: JSON.stringify(this.toInsertRow(invitedUser)),
        });
        await this.assertSupabaseOk(insertRes);
        return invitedUser;
    }

    async create(user: Omit<User, 'id'>): Promise<User> {
        const normalizedMobile = normalizePhone(user.mobile);
        const normalizedEmail = user.email?.trim().toLowerCase();
        const passwordHash = user.password ? await this.hashPassword(user.password) : undefined;
        const users = await this.fetchAllUsersFromSupabase();
        const existingInvitedUser = users.find(
            (entry: User) => !entry.email && !entry.passwordHash && (
                (normalizedMobile && phoneLookupKey(entry.mobile) === phoneLookupKey(normalizedMobile))
            ),
        );

        if (existingInvitedUser) {
            const patchBody = {
                ...(normalizedEmail ? { email: normalizedEmail } : {}),
                ...(passwordHash ? { password_hash: passwordHash } : {}),
                ...(user.name ? { name: user.name } : {}),
                ...(normalizedMobile ? { mobile: normalizedMobile } : {}),
            };
            const patchRes = await this.supabaseService.rest(`users?id=eq.${encodeURIComponent(existingInvitedUser.id)}`, {
                method: 'PATCH',
                body: JSON.stringify(patchBody),
            });
            await this.assertSupabaseOk(patchRes);
            return {
                ...existingInvitedUser,
                ...(normalizedEmail ? { email: normalizedEmail } : {}),
                ...(passwordHash ? { passwordHash } : {}),
                ...(user.name ? { name: user.name } : {}),
                ...(normalizedMobile ? { mobile: normalizedMobile } : {}),
            };
        }

        const existingUser = users.find((entry: User) => entry.email?.trim().toLowerCase() === normalizedEmail);
        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        const newUser = {
            ...user,
            email: normalizedEmail,
            mobile: normalizedMobile,
            password: undefined,
            passwordHash,
            id: randomUUID(),
        } as User;

        const insertRes = await this.supabaseService.rest('users', {
            method: 'POST',
            body: JSON.stringify(this.toInsertRow(newUser)),
        });
        await this.assertSupabaseOk(insertRes);
        return newUser;
    }

    async updatePushToken(id: string, pushToken: string): Promise<User | undefined> {
        const existing = await this.findOneById(id);
        if (!existing) return undefined;
        const patchRes = await this.supabaseService.rest(`users?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ push_token: pushToken }),
        });
        await this.assertSupabaseOk(patchRes);
        return { ...existing, pushToken };
    }

    async updateUser(id: string, updates: Partial<Omit<User, 'id'>>): Promise<User | undefined> {
        const normalizedEmail = updates.email?.trim().toLowerCase();
        const normalizedMobile = typeof updates.mobile === 'string' ? normalizePhone(updates.mobile) : undefined;
        const users = await this.fetchAllUsersFromSupabase();
        const user = users.find((entry: User) => entry.id === id);
        if (!user) return undefined;

        if (normalizedEmail) {
            const existingUser = users.find(
                (entry: User) => entry.id !== id && entry.email?.trim().toLowerCase() === normalizedEmail,
            );
            if (existingUser) {
                throw new Error('User with this email already exists');
            }
        }

        const patchBody: Record<string, string | null> = {};
        if (normalizedEmail) {
            patchBody.email = normalizedEmail;
        } else if (updates.email === '') {
            patchBody.email = null;
        }
        if (typeof updates.name === 'string') {
            patchBody.name = updates.name.trim();
        }
        if (typeof updates.mobile === 'string') {
            patchBody.mobile = normalizedMobile || null;
        }
        if (typeof updates.avatar === 'string') {
            const uploadedAvatar = await this.maybeUploadAvatarForSupabase(id, updates.avatar);
            patchBody.avatar = uploadedAvatar || null;
        }
        if (typeof updates.password === 'string' && updates.password.trim()) {
            patchBody.password_hash = await this.hashPassword(updates.password.trim());
        }

        const patchRes = await this.supabaseService.rest(`users?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(patchBody),
        });
        await this.assertSupabaseOk(patchRes);

        return {
            ...user,
            ...(patchBody.name !== undefined ? { name: patchBody.name || user.name } : {}),
            ...(patchBody.email !== undefined ? { email: patchBody.email || undefined } : {}),
            ...(patchBody.mobile !== undefined ? { mobile: patchBody.mobile || undefined } : {}),
            ...(patchBody.avatar !== undefined ? { avatar: patchBody.avatar || undefined } : {}),
            ...(patchBody.password_hash !== undefined ? { passwordHash: patchBody.password_hash || undefined } : {}),
        };
    }
}
