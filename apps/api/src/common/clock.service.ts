import { Injectable } from '@nestjs/common';

@Injectable()
export class ClockService {
  private customNow: Date | null = null;

  /**
   * Returns current Date in UTC.
   */
  now(): Date {
    return this.customNow ? new Date(this.customNow.getTime()) : new Date();
  }

  /**
   * Returns current timestamp in ISO 8601 UTC.
   */
  nowIso(): string {
    return this.now().toISOString();
  }

  /**
   * For testing purposes: allows setting a fixed or simulated clock.
   */
  setMockTime(date: Date | null): void {
    this.customNow = date;
  }
}
