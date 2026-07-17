// Shared currency conversions. Copper (cp) is the stored unit; 100 cp = 1 GP.

/** Gold pieces → copper (integer). */
export const toCp = (gp: number): number => Math.round(gp * 100);

/** Copper → gold-piece string with 2 decimals (e.g. 12500 → "125.00"). */
export const toGp = (cp: number): string => (cp / 100).toFixed(2);
