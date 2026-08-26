require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateWorkforceLineCost,
  inclusiveWorkforceDays,
} = require('../server/modules/workforce/domain/workforcePricing');

test('workforce pricing applies quantity, inclusive service days and hours exactly once', () => {
  const start = new Date('2026-08-28T00:00:00.000Z');
  const end = new Date('2026-09-02T00:00:00.000Z');
  assert.equal(inclusiveWorkforceDays(start, end), 6);
  assert.equal(calculateWorkforceLineCost({ quantity: 4, unitRate: 3.70, rateUnit: 'HOURLY', start, end, hoursPerDay: 8 }), 710.40);
  assert.equal(calculateWorkforceLineCost({ quantity: 3, unitRate: 33, rateUnit: 'DAILY_9', start, end }), 594);
  assert.equal(calculateWorkforceLineCost({ quantity: 3, unitRate: 38, rateUnit: 'DAILY_12', start, end }), 684);
});

test('calendar-day pricing is stable across offsets and month boundaries', () => {
  const start = new Date('2026-03-28T00:00:00+04:00');
  const end = new Date('2026-03-30T00:00:00+04:00');
  assert.equal(inclusiveWorkforceDays(start, end), 3);
  assert.equal(calculateWorkforceLineCost({ quantity: 2, unitRate: 4.37, rateUnit: 'HOURLY', start, end, hoursPerDay: 3 }), 78.66);
});

test('daily package rates do not multiply by their nominal 9 or 12 hours', () => {
  const day = new Date('2026-08-26T00:00:00.000Z');
  assert.equal(calculateWorkforceLineCost({ quantity: 2, unitRate: 35, rateUnit: 'DAILY_9', start: day, end: day, hoursPerDay: 9 }), 70);
  assert.equal(calculateWorkforceLineCost({ quantity: 2, unitRate: 47, rateUnit: 'DAILY_12', start: day, end: day, hoursPerDay: 12 }), 94);
});
