import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CachedToken = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class AerolineasTokenProvider {
  private readonly logger = new Logger(AerolineasTokenProvider.name);
  private cachedToken: CachedToken | null = null;

  constructor(private readonly config: ConfigService) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value;
    }

    const webBaseUrl = this.config.get<string>('aerolineasWebBaseUrl') ?? 'https://www.aerolineas.com.ar';
    const response = await fetch(webBaseUrl, {
      headers: {
        'User-Agent': this.userAgent(),
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Aerolíneas token request failed with status ${response.status}.`);
    }

    const html = await response.text();
    const token = this.extractToken(html);
    const expiresAt = this.resolveExpiresAt(token);
    this.cachedToken = { value: token, expiresAt };
    if (this.verboseLogs()) {
      this.logger.log(`Aerolíneas token refreshed. expiresAt=${new Date(expiresAt).toISOString()}.`);
    }

    return token;
  }

  extractToken(html: string): string {
    const token = html.match(/window\.__ACCESS_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
    if (!token) {
      throw new Error('Aerolíneas access token was not found in the homepage HTML.');
    }
    return token;
  }

  private resolveExpiresAt(token: string): number {
    const jwtExpiresAt = this.decodeJwtExpiration(token);
    if (jwtExpiresAt) {
      return jwtExpiresAt;
    }

    const ttlSeconds = this.config.get<number>('aerolineasTokenTtlSeconds') ?? 900;
    return Date.now() + ttlSeconds * 1000;
  }

  private decodeJwtExpiration(token: string): number | null {
    try {
      const [, payload] = token.split('.');
      if (!payload) {
        return null;
      }
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as { exp?: number };
      return decoded.exp ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private userAgent(): string {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  }

  private verboseLogs(): boolean {
    const value = this.config.get<boolean>('enableVerboseWatchLogs');
    if (typeof value === 'boolean') {
      return value;
    }
    return process.env.ENABLE_VERBOSE_WATCH_LOGS === 'true';
  }
}
