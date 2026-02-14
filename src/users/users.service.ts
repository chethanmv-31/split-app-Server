import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { DbService } from '../common/db/db.service';

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
    constructor(private readonly dbService: DbService) { }

    async findAll(): Promise<User[]> {
        const db = await this.dbService.readDb();
        return db.users as User[];
    }

    async findOneByMobile(mobile: string): Promise<User | undefined> {
        const normalizedMobile = phoneLookupKey(mobile);
        const db = await this.dbService.readDb();
        return (db.users as User[]).find((user: User) => phoneLookupKey(user.mobile) === normalizedMobile);
    }

    async findOneByEmail(email: string): Promise<User | undefined> {
        const normalizedEmail = email.trim().toLowerCase();
        const db = await this.dbService.readDb();
        return (db.users as User[]).find((user: User) => user.email?.trim().toLowerCase() === normalizedEmail);
    }

    private async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    private async checkPassword(password: string, user: User): Promise<boolean> {
        if (user.passwordHash) {
            return bcrypt.compare(password, user.passwordHash);
        }
        if (user.password) {
            return user.password === password;
        }
        return false;
    }

    async validateCredentials(email: string, password: string): Promise<User | undefined> {
        const normalizedEmail = email.trim().toLowerCase();
        let authenticatedUser: User | undefined;

        await this.dbService.updateDb(async (db) => {
            const users = db.users as User[];
            const user = users.find((entry) => entry.email?.trim().toLowerCase() === normalizedEmail);
            if (!user) {
                return;
            }
            const isValid = await this.checkPassword(password, user);
            if (!isValid) {
                return;
            }

            if (!user.passwordHash && user.password) {
                user.passwordHash = await this.hashPassword(user.password);
                delete user.password;
            }
            authenticatedUser = user;
        });

        return authenticatedUser;
    }

    async findByQuery(query: Partial<User>): Promise<User[]> {
        const db = await this.dbService.readDb();
        const safeQuery = { ...query };
        delete safeQuery.password;
        delete safeQuery.passwordHash;

        return (db.users as User[]).filter((user: User) => {
            return Object.entries(safeQuery).every(([key, value]) => {
                if (value === undefined) return true;
                if (key === 'password' || key === 'passwordHash') return false;
                return user[key] === value;
            });
        });
    }

    async findOneById(id: string): Promise<User | undefined> {
        const db = await this.dbService.readDb();
        return (db.users as User[]).find((user: User) => user.id === id);
    }

    async createInvitedUser(userData: { name: string; mobile?: string }): Promise<User> {
        const normalizedMobile = normalizePhone(userData.mobile);
        let invitedUser!: User;

        await this.dbService.updateDb((db) => {
            const users = db.users as User[];
            if (normalizedMobile) {
                const existingUser = users.find(
                    (entry: User) => phoneLookupKey(entry.mobile) === phoneLookupKey(normalizedMobile)
                );
                if (existingUser) {
                    existingUser.name = userData.name;
                    invitedUser = existingUser;
                    return;
                }
            }

            invitedUser = {
                name: userData.name,
                mobile: normalizedMobile,
                id: randomUUID(),
            } as User;
            users.push(invitedUser);
        });

        return invitedUser;
    }

    async create(user: Omit<User, 'id'>): Promise<User> {
        const normalizedMobile = normalizePhone(user.mobile);
        const normalizedEmail = user.email?.trim().toLowerCase();
        const passwordHash = user.password ? await this.hashPassword(user.password) : undefined;
        let createdUser!: User;

        await this.dbService.updateDb((db) => {
            const users = db.users as User[];
            const existingInvitedUser = users.find(
                (entry: User) => !entry.email && !entry.passwordHash && !entry.password && (
                    (normalizedMobile && phoneLookupKey(entry.mobile) === phoneLookupKey(normalizedMobile))
                )
            );

            if (existingInvitedUser) {
                if (normalizedEmail) existingInvitedUser.email = normalizedEmail;
                if (passwordHash) existingInvitedUser.passwordHash = passwordHash;
                if (user.name) existingInvitedUser.name = user.name;
                if (normalizedMobile) existingInvitedUser.mobile = normalizedMobile;
                delete existingInvitedUser.password;
                createdUser = existingInvitedUser;
                return;
            }

            const existingUser = users.find(
                (entry: User) => entry.email?.trim().toLowerCase() === normalizedEmail
            );

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
            users.push(newUser);
            createdUser = newUser;
        });

        return createdUser;
    }

    async updatePushToken(id: string, pushToken: string): Promise<User | undefined> {
        let updatedUser: User | undefined;
        await this.dbService.updateDb((db) => {
            const users = db.users as User[];
            const user = users.find((entry: User) => entry.id === id);
            if (!user) {
                updatedUser = undefined;
                return;
            }
            user.pushToken = pushToken;
            updatedUser = user;
        });
        return updatedUser;
    }

    async updateUser(id: string, updates: Partial<Omit<User, 'id'>>): Promise<User | undefined> {
        const normalizedEmail = updates.email?.trim().toLowerCase();
        const normalizedMobile = typeof updates.mobile === 'string' ? normalizePhone(updates.mobile) : undefined;
        let updatedUser: User | undefined;

        await this.dbService.updateDb(async (db) => {
            const users = db.users as User[];
            const user = users.find((entry: User) => entry.id === id);
            if (!user) {
                updatedUser = undefined;
                return;
            }

            if (normalizedEmail) {
                const existingUser = users.find(
                    (entry: User) => entry.id !== id && entry.email?.trim().toLowerCase() === normalizedEmail
                );
                if (existingUser) {
                    throw new Error('User with this email already exists');
                }
                user.email = normalizedEmail;
            } else if (updates.email === '') {
                user.email = undefined;
            }

            if (typeof updates.name === 'string') {
                user.name = updates.name.trim();
            }

            if (typeof updates.mobile === 'string') {
                user.mobile = normalizedMobile || undefined;
            }

            if (typeof updates.avatar === 'string') {
                user.avatar = updates.avatar.trim() || undefined;
            }

            if (typeof updates.password === 'string' && updates.password.trim()) {
                user.passwordHash = await this.hashPassword(updates.password.trim());
                delete user.password;
            }

            updatedUser = user;
        });

        return updatedUser;
    }
}
