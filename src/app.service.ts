import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async checkSupabaseHealth(): Promise<{
    success: boolean;
    message: string;
    details?: string;
  }> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const schema = this.configService.get<string>('SUPABASE_DB_SCHEMA') || 'public';

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        success: false,
        message: 'Missing Supabase configuration',
        details: 'SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY not set',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/users?select=id&limit=1`,
        {
          method: 'GET',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Accept-Profile': schema,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          message: 'Supabase connectivity failed',
          details: `HTTP ${response.status}: ${errText}`,
        };
      }

      return {
        success: true,
        message: 'Supabase connectivity OK',
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Supabase connectivity failed',
        details: error?.message || 'Unknown error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
