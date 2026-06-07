import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JetSmartAvailabilityResponse } from './jetsmart.types';

@Injectable()
export class JetSmartApiClient {
  private readonly logger = new Logger(JetSmartApiClient.name);

  constructor(private readonly config: ConfigService) {}

  async searchAvailability(searchParams: URLSearchParams): Promise<JetSmartAvailabilityResponse> {
    const baseUrl = this.config.get<string>('jetsmartApiBaseUrl') ?? 'https://origin.jsrtff.it.jetsm.art';
    const url = `${baseUrl}/availability/plain?${searchParams.toString()}`;
    const retries = this.config.get<number>('jetsmartHttpRetries') ?? 1;
    const timeoutMs = this.config.get<number>('jetsmartHttpTimeoutMs') ?? 15000;

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        if (this.verboseLogs()) {
          this.logger.log(`JetSMART availability request attempt=${attempt + 1}.`);
        }
        return await this.fetchJson(url, timeoutMs);
      } catch (error) {
        lastError = error;
        this.logger.warn(`JetSMART availability request failed on attempt=${attempt + 1}: ${this.errorMessage(error)}.`);
      }
    }

    throw new Error(`JetSMART availability request failed after ${retries + 1} attempt(s): ${this.errorMessage(lastError)}.`);
  }

  private async fetchJson(url: string, timeoutMs: number): Promise<JetSmartAvailabilityResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'User-Agent': this.userAgent(),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`JetSMART API responded with status ${response.status}. body=${body.slice(0, 300)}`);
      }

      return (await response.json()) as JetSmartAvailabilityResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`JetSMART API request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private userAgent(): string {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private verboseLogs(): boolean {
    const value = this.config.get<boolean>('enableVerboseWatchLogs');
    if (typeof value === 'boolean') {
      return value;
    }
    return process.env.ENABLE_VERBOSE_WATCH_LOGS === 'true';
  }
}
