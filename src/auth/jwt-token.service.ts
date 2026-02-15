import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface JwtPayload {
  sub: string;
  userId: string;
  email?: string;
  mobile?: string;
  exp?: number;
  iat?: number;
}

@Injectable()
export class JwtTokenService {
  private readonly secret: string;
  private readonly expiresInSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }
    this.secret = secret;
    this.expiresInSeconds = Number(
      this.configService.get<string>('JWT_EXPIRES_IN_SECONDS') || 60 * 60 * 24 * 7,
    );
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private base64UrlDecode(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  private signSegment(segment: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(segment)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  sign(payload: JwtPayload): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + this.expiresInSeconds,
    };

    const header = this.base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = this.base64UrlEncode(JSON.stringify(fullPayload));
    const signature = this.signSegment(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  verify(token: string): JwtPayload {
    const segments = token.split('.');
    if (segments.length !== 3) {
      throw new UnauthorizedException('Invalid token');
    }

    const [header, body, signature] = segments;
    const expectedSignature = this.signSegment(`${header}.${body}`);
    if (expectedSignature !== signature) {
      throw new UnauthorizedException('Invalid token signature');
    }

    const payload = JSON.parse(this.base64UrlDecode(body)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) {
      throw new UnauthorizedException('Token expired');
    }

    return payload;
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      return this.verify(token);
    } catch (localError) {
      const url = this.configService.get<string>('SUPABASE_URL')?.trim();
      const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY')?.trim();
      const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
      const apiKey = anonKey || serviceRoleKey;
      if (!url || !apiKey) {
        throw localError;
      }

      try {
        const response = await fetch(`${url}/auth/v1/user`, {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new UnauthorizedException('Invalid token');
        }

        const user = await response.json();
        if (!user?.id || typeof user.id !== 'string') {
          throw new UnauthorizedException('Invalid token');
        }

        return {
          sub: user.id,
          userId: user.id,
          email: typeof user.email === 'string' ? user.email : undefined,
          mobile: typeof user.phone === 'string' ? user.phone : undefined,
        };
      } catch {
        throw new UnauthorizedException('Invalid token');
      }
    }
  }
}
