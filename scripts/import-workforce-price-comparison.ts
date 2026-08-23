import { PrismaClient, VendorApprovalStatus, WorkforceRateUnit } from '@prisma/client';

const prisma = new PrismaClient();

const vendorNames = [
  'Plain Service', 'AIMConsulting', 'Pey Service', 'Elite Outsource F/Ş',
  'Əliyev Tural F/Ş', 'Rizalli Catering', 'Global təmizlik şirkəti MMC',
];

const rows: Array<[string, number[], string?]> = [
  ['Housekeeping attendant hourly', [4.5, 4.37, 4.25, 4.1, 4.75, 3.7, 4]],
  ['Housekeeping attendant daily 9 hours', [36, 35, 34, 32, 38, 34, 36]],
  ['Laundry attendant hourly', [4.5, 4.37, 4.25, 4.1, 4.75, 3.7, 4]],
  ['Laundry attendant daily 9 hours', [36, 35, 34, 32, 38, 34, 36]],
  ['Waiter restaurant hourly', [4.375, 5.25, 4.875, 4.1, 5, 4.2, 4.7], 'Knowledge of English language required'],
  ['Waiter restaurant daily 9 hours', [35, 42, 35, 33, 40, 38, 39], 'Knowledge of English language required'],
  ['Waiter restaurant daily 12 hours', [42, 47, 42, 38, 45, 41, 42], 'Knowledge of English language required'],
  ['Waiter banquet hourly', [4.375, 5, 4.22, 4.1, 5, 3.7, 3.9]],
  ['Waiter banquet daily 9 hours', [35, 40, 35, 33, 40, 34, 36]],
  ['Waiter banquet daily 12 hours', [42, 45, 42, 38, 45, 37, 39]],
  ['Stewarding attendant hourly', [4.375, 4.5, 4.25, 4.1, 5.625, 3.9, 4]],
  ['Stewarding attendant daily 9 hours', [35, 36, 34, 33, 45, 35, 36]],
  ['Stewarding attendant daily 12 hours', [45, 41, 40, 38, 55, 39, 41]],
  ['Chef de partie hourly', [5.5, 5.8, 4.77, 5.4, 6.25, 5.4, 5.9]],
  ['Chef de partie daily 9 hours', [44, 47, 43, 45, 50, 50, 52]],
  ['Chef de partie daily 12 hours', [48, 52, 47, 58, 60, 55, 57]],
  ['Commis hourly', [5, 5.5, 5.25, 5, 5, 2.7, 2.9]],
  ['Commis daily 9 hours', [40, 44, 42, 41, 40, 32, 35]],
  ['Commis daily 12 hours', [45, 49, 46, 54, 45, 34, 36]],
  ['Butcher hourly', [7.5, 8.5, 6.875, 7.7, 8.75, 5.9, 6]],
  ['Butcher daily 9 hours', [60, 68, 55, 68, 70, 55, 59]],
];

const insuranceNotes = 'Vendor must have indemnity and general liability insurance. All supplied personnel must undergo medical checkups every 6 months and have mandatory health insurance.';

function parseService(label: string) {
  if (label.endsWith(' daily 12 hours')) return { name: label.replace(' daily 12 hours', ''), unit: WorkforceRateUnit.DAILY_12 };
  if (label.endsWith(' daily 9 hours')) return { name: label.replace(' daily 9 hours', ''), unit: WorkforceRateUnit.DAILY_9 };
  return { name: label.replace(' hourly', ''), unit: WorkforceRateUnit.HOURLY };
}

async function main() {
  const vendors = await Promise.all(vendorNames.map((name) => prisma.vendor.upsert({
    where: { name },
    update: { isActive: true, isApproved: true, approvalStatus: VendorApprovalStatus.APPROVED, approvedAt: new Date(), insuranceNotes },
    create: { name, isActive: true, isApproved: true, approvalStatus: VendorApprovalStatus.APPROVED, approvedAt: new Date(), insuranceNotes },
  })));

  let imported = 0;
  for (const [label, prices, requirements] of rows) {
    const service = parseService(label);
    const position = await prisma.workforcePosition.upsert({
      where: { name: service.name }, update: { isActive: true }, create: { name: service.name },
    });
    for (let index = 0; index < vendors.length; index += 1) {
      await prisma.vendorServiceRate.upsert({
        where: { vendorId_positionId_unit: { vendorId: vendors[index].id, positionId: position.id, unit: service.unit } },
        update: { price: Math.round(prices[index] * 100) / 100, currency: 'AZN', uom: 'Each', requirements: requirements || null, isActive: true },
        create: { vendorId: vendors[index].id, positionId: position.id, unit: service.unit, price: Math.round(prices[index] * 100) / 100, currency: 'AZN', uom: 'Each', requirements: requirements || null },
      });
      imported += 1;
    }
  }
  console.log(`Imported ${vendors.length} vendors and ${imported} vendor service rates.`);
}

main().finally(() => prisma.$disconnect());
