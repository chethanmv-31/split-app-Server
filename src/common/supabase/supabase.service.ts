import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<string>('USE_SUPABASE') === 'true';
  }

  private getConfig() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const schema = this.configService.get<string>('SUPABASE_DB_SCHEMA') || 'public';
    return { url, serviceRoleKey, schema };
  }

  async rest(pathWithQuery: string, init?: RequestInit): Promise<Response> {
    const { url, serviceRoleKey, schema } = this.getConfig();
    if (!url || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration');
    }

    const response = await fetch(`${url}/rest/v1/${pathWithQuery}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        'Accept-Profile': schema,
        'Content-Profile': schema,
        ...(init?.headers || {}),
      },
    });

    return response;
  }

  async uploadBase64Object(params: {
    bucket: string;
    objectPath: string;
    dataUrl: string;
    upsert?: boolean;
    maxBytes?: number;
    allowedMimeTypes?: string[];
  }): Promise<string> {
    const { url, serviceRoleKey } = this.getConfig();
    if (!url || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration');
    }

    const match = params.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new BadRequestException('Invalid data URL format for upload');

    const mimeType = match[1] || 'application/octet-stream';
    if (Array.isArray(params.allowedMimeTypes) && params.allowedMimeTypes.length > 0) {
      if (!params.allowedMimeTypes.includes(mimeType)) {
        throw new BadRequestException(`Unsupported file type: ${mimeType}`);
      }
    }
    const base64Payload = match[2];
    const buffer = Buffer.from(base64Payload, 'base64');
    if (params.maxBytes && buffer.byteLength > params.maxBytes) {
      throw new BadRequestException(`File too large: ${buffer.byteLength} bytes exceeds limit ${params.maxBytes}`);
    }

    const objectPath = params.objectPath.replace(/^\/+/, '');
    const endpoint = `${url}/storage/v1/object/${params.bucket}/${objectPath}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': params.upsert === false ? 'false' : 'true',
      },
      body: buffer,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase storage upload failed: ${response.status} ${details}`);
    }

    return `${url}/storage/v1/object/public/${params.bucket}/${objectPath}`;
  }
}
