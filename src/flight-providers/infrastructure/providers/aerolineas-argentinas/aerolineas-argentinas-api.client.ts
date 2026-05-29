import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AerolineasTokenProvider } from './aerolineas-token.provider';
import { AerolineasHttpError } from './aerolineas-http.error';
import { AerolineasFlightOffersResponse } from './aerolineas.types';

@Injectable()
export class AerolineasArgentinasApiClient {
  private readonly logger = new Logger(AerolineasArgentinasApiClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenProvider: AerolineasTokenProvider,
  ) {}

  async searchOffers(searchParams: URLSearchParams): Promise<AerolineasFlightOffersResponse> {
    const apiBaseUrl = this.config.get<string>('aerolineasApiBaseUrl') ?? 'https://api.aerolineas.com.ar';
    const url = `${apiBaseUrl}/v1/flights/offers?${searchParams.toString()}`;
    const retries = this.config.get<number>('aerolineasHttpRetries') ?? 1;
    const timeoutMs = this.config.get<number>('aerolineasHttpTimeoutMs') ?? 15000;
    const token = await this.tokenProvider.getToken();

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        if (this.verboseLogs()) {
          this.logger.log(`Aerolíneas offers request attempt=${attempt + 1}.`);
        }
        return await this.fetchJson(url, token, timeoutMs);
      } catch (error) {
        lastError = error;
        this.logger.warn(`Aerolíneas offers request failed on attempt=${attempt + 1}: ${this.errorMessage(error)}.`);
      }
    }

    if (lastError instanceof AerolineasHttpError) {
      throw lastError;
    }

    throw new Error(`Aerolíneas offers request failed after ${retries + 1} attempt(s): ${this.errorMessage(lastError)}.`);
  }

  private async fetchJson(
    url: string,
    token: string,
    timeoutMs: number,
  ): Promise<AerolineasFlightOffersResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Channel-Id': 'WEB_AR',
          'Accept-Language': 'es-AR',
          Origin: this.config.get<string>('aerolineasWebBaseUrl') ?? 'https://www.aerolineas.com.ar',
          Referer: `${this.config.get<string>('aerolineasWebBaseUrl') ?? 'https://www.aerolineas.com.ar'}/`,
          'User-Agent': this.userAgent(),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AerolineasHttpError(
          `Aerolíneas API responded with status ${response.status}.`,
          response.status,
          body.slice(0, 300),
        );
      }

      return (await response.json()) as AerolineasFlightOffersResponse;
    } catch (error) {
      if (error instanceof AerolineasHttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AerolineasHttpError(`Aerolíneas API request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof AerolineasHttpError) {
      return [
        error.message,
        error.statusCode ? `status=${error.statusCode}` : null,
        error.responseBody ? `body=${error.responseBody}` : null,
      ].filter(Boolean).join(' ');
    }
    return error instanceof Error ? error.message : String(error);
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
