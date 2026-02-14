import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface AppDb {
  users: any[];
  expenses: any[];
  groups: any[];
  authState?: {
    loginAttempts?: Record<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>;
    otpSendAttempts?: Record<string, { count: number; firstAttemptAt: number }>;
  };
  [key: string]: any;
}

@Injectable()
export class DbService {
  private readonly logger = new Logger(DbService.name);
  private readonly dbPath = path.join(process.cwd(), 'db.json');
  private readonly defaultDb: AppDb = {
    users: [],
    expenses: [],
    groups: [],
    authState: { loginAttempts: {}, otpSendAttempts: {} },
  };
  private writeQueue: Promise<void> = Promise.resolve();

  private async ensureDb(): Promise<AppDb> {
    if (!fs.existsSync(this.dbPath)) {
      await fs.promises.writeFile(
        this.dbPath,
        JSON.stringify(this.defaultDb, null, 2),
        'utf8',
      );
      return { ...this.defaultDb };
    }

    const raw = await fs.promises.readFile(this.dbPath, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...this.defaultDb,
      ...parsed,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      authState: {
        loginAttempts:
          parsed?.authState && typeof parsed.authState.loginAttempts === 'object'
            ? parsed.authState.loginAttempts
            : {},
        otpSendAttempts:
          parsed?.authState && typeof parsed.authState.otpSendAttempts === 'object'
            ? parsed.authState.otpSendAttempts
            : {},
      },
    };
  }

  async readDb(): Promise<AppDb> {
    return this.ensureDb();
  }

  async updateDb<T>(mutator: (db: AppDb) => T | Promise<T>): Promise<T> {
    let result!: T;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const db = await this.ensureDb();
        result = await mutator(db);
        await fs.promises.writeFile(this.dbPath, JSON.stringify(db, null, 2), 'utf8');
      })
      .catch((error) => {
        this.logger.error('Failed to update db.json', error instanceof Error ? error.stack : String(error));
        throw error;
      });

    await this.writeQueue;
    return result;
  }
}
