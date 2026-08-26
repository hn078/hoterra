const DAY_MS = 86_400_000;
export type WorkforcePricingUnit = 'HOURLY' | 'DAILY_9' | 'DAILY_12';

export function roundWorkforceMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Counts hotel service calendar dates inclusively, independent of server DST/timezone. */
export function inclusiveWorkforceDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.floor((endUtc - startUtc) / DAY_MS) + 1);
}

export function calculateWorkforceLineCost(input: {
  quantity: number;
  unitRate: number;
  rateUnit: WorkforcePricingUnit;
  start: Date;
  end: Date;
  hoursPerDay?: number | null;
}) {
  const { quantity, unitRate, rateUnit, start, end } = input;
  const hoursMultiplier = rateUnit === 'HOURLY'
    ? Number(input.hoursPerDay)
    : 1;
  if (
    !Number.isInteger(quantity) || quantity < 1 ||
    !Number.isFinite(unitRate) || unitRate < 0 ||
    !Number.isFinite(hoursMultiplier) || hoursMultiplier <= 0
  ) {
    throw new Error('Invalid workforce pricing input');
  }
  return roundWorkforceMoney(
    quantity * unitRate * inclusiveWorkforceDays(start, end) * hoursMultiplier,
  );
}
