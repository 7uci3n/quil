// Pure helpers for Downtime-Point day-boundary math (no deps — safe to import
// from both the domain layer and the migration). DTP accrues once per period,
// where a period is a day divided by the configured rate.

/** Seconds in one DTP accrual period for a given rate (>=1). */
export function dtpPeriod(rate: number): number {
  return Math.round(86400 / Math.max(rate, 1));
}

/** Normalize a unix-seconds timestamp down to the current period boundary. */
export function dtpDayBoundary(nowSeconds: number, rate: number): number {
  const period = dtpPeriod(rate);
  const now = Math.round(nowSeconds);
  return now - (now % period);
}
