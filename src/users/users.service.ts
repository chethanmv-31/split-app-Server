import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Helper function to normalize phone numbers by removing +91 prefix
const normalizePhone = (phone?: string): string | undefined => {
    if (!phone) return phone;
    return phone.replace(/^\+91/, '').trim();
};

export interface User {
    id: string;
    name: string;
    email?: string;
    password?: string;
    mobile?: string;
    pushToken?: string;
    [key: string]: string | undefined;
}

@Injectable()
export class UsersService implements OnModuleInit {
    private readonly dbPath = path.join(process.cwd(), 'db.json');
    private db: { users: User[]; expenses: any[] } = { users: [], expenses: [] };

    onModuleInit() {
        this.loadDb();
    }

    private loadDb() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                const parsedDb = JSON.parse(data);
                this.db = {
                    users: parsedDb.users || [],
                    expenses: parsedDb.expenses || [],
                    ...parsedDb, // Preserve any other fields
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
            // Merge: keep the current users state but preserve other fields from disk
            const mergedDb = {
                ...diskDb,
                users: this.db.users, // Override with current users state
            };
            console.log(`[UsersService] Saving to db.json - users count: ${mergedDb.users.length}, expenses count: ${mergedDb.expenses?.length || 0}`);
            fs.writeFileSync(this.dbPath, JSON.stringify(mergedDb, null, 2), 'utf8');
            console.log(`[UsersService] Successfully saved to ${this.dbPath}`);
        } catch (error) {
            console.error('Error saving db.json:', error);
        }
    }

    async findAll(): Promise<User[]> {
        return this.db.users;
    }

    async findOneByMobile(mobile: string): Promise<User | undefined> {
        const normalizedMobile = normalizePhone(mobile);
        return this.db.users.find((user: User) => normalizePhone(user.mobile) === normalizedMobile);
    }

    async findByQuery(query: Partial<User>): Promise<User[]> {
        return this.db.users.filter((user: User) => {
            return Object.entries(query).every(([key, value]) => {
                if (value === undefined) return true;
                return user[key] === value;
            });
        });
    }

    async findOneById(id: string): Promise<User | undefined> {
        return this.db.users.find((user: User) => user.id === id);
    }

    async createInvitedUser(userData: { name: string; mobile?: string }): Promise<User> {
        console.log(`[UsersService] Creating invited user:`, userData);
        // Normalize the mobile number
        const normalizedMobile = normalizePhone(userData.mobile);
        console.log(`[UsersService] Normalized mobile:`, normalizedMobile);

        // Check if ANY user with same mobile already exists (not just invited users)
        if (normalizedMobile) {
            const existingUser = this.db.users.find(
                (u: User) => normalizePhone(u.mobile) === normalizedMobile
            );
            if (existingUser) {
                // Update existing user (whether invited or registered)
                existingUser.name = userData.name;
                console.log(`[UsersService] Found existing user with this mobile, updating:`, existingUser);
                this.saveDb();
                console.log(`[UsersService] Updated user ${existingUser.id}`);
                return existingUser;
            }
        }

        // Create new invited user (no email, no password)
        const invitedUser = {
            name: userData.name,
            mobile: normalizedMobile,
            id: Math.random().toString(36).substring(2, 9),
        } as User;
        console.log(`[UsersService] New invited user object:`, invitedUser);
        this.db.users.push(invitedUser);
        console.log(`[UsersService] Added to db.users, total users:`, this.db.users.length);
        this.saveDb();
        console.log(`[UsersService] Created invited user ${invitedUser.id}, current db:`, this.db);
        return invitedUser;
    }

    async create(user: Omit<User, 'id'>): Promise<User> {
        // Normalize the mobile number
        const normalizedMobile = normalizePhone(user.mobile);

        // Check if there's an existing invited user with the same mobile
        const existingInvitedUser = this.db.users.find(
            (u: User) => !u.email && !u.password && (
                (normalizedMobile && normalizePhone(u.mobile) === normalizedMobile)
            )
        );

        if (existingInvitedUser) {
            // Merge the invited user with the new signup data
            if (user.email) existingInvitedUser.email = user.email;
            if (user.password) existingInvitedUser.password = user.password;
            if (user.name) existingInvitedUser.name = user.name;
            if (normalizedMobile) existingInvitedUser.mobile = normalizedMobile;
            // Keep the existing ID and pushToken if any
            this.saveDb();
            console.log(`[UsersService] Merged invited user ${existingInvitedUser.id} with signup data`);
            return existingInvitedUser;
        }

        // Check if user with same email already exists
        const existingUser = this.db.users.find(
            (u: User) => u.email === user.email
        );

        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        // No invited user found, create a new user
        const newUser = {
            ...user,
            mobile: normalizedMobile,
            id: Math.random().toString(36).substring(2, 9),
        } as User;
        this.db.users.push(newUser);
        this.saveDb();
        return newUser;
    }

    async updatePushToken(id: string, pushToken: string): Promise<User | undefined> {
        const user = await this.findOneById(id);
        if (user) {
            user.pushToken = pushToken;
            this.saveDb();
            return user;
        }
        return undefined;
    }
}
