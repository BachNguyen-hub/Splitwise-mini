import { splitEqual } from '../src/settlement.mjs';

// Synthetic data entered through the authenticated website UI on 2026-09-26.
// A denotes the account owner; B–F are guest members named Test B–Test F.
// Recorded outputs are observations, not a copy of the website's source code.
export const auditMemberIds = ['A', 'B', 'C', 'D', 'E', 'F'];

export function createAuditLedger({ afterPartialPayment = false } = {}) {
  const amounts = [108000, 102000, 96000, 6000, 12000, 36000];
  const expenses = amounts.map((amountMinor, index) => ({
    id: `audit-${index + 1}`,
    amountMinor,
    payers: [{ memberId: auditMemberIds[index], amountMinor }],
    shares: splitEqual(amountMinor, auditMemberIds),
  }));
  const settlements = [];
  if (afterPartialPayment) {
    // The seventh expense was reused to test six split modes, then saved as a
    // private expense. It has no net effect on balances in the final snapshot.
    expenses.push({
      id: 'audit-7', amountMinor: 120000,
      payers: [{ memberId: 'A', amountMinor: 120000 }],
      shares: [{ memberId: 'A', amountMinor: 120000 }],
    });
    settlements.push({
      id: 'audit-repayment-1', from: 'E', to: 'A', amountMinor: 6000, status: 'confirmed',
    });
  }
  return { memberIds: [...auditMemberIds], expenses, settlements };
}

export const websiteBaselineTransfers = [
  { from: 'D', to: 'C', amountMinor: 36000 },
  { from: 'D', to: 'B', amountMinor: 18000 },
  { from: 'E', to: 'B', amountMinor: 24000 },
  { from: 'E', to: 'A', amountMinor: 24000 },
  { from: 'F', to: 'A', amountMinor: 24000 },
];

export const websiteAfterPartialTransfers = [
  { from: 'D', to: 'C', amountMinor: 36000 },
  { from: 'D', to: 'A', amountMinor: 18000 },
  { from: 'E', to: 'A', amountMinor: 24000 },
  { from: 'E', to: 'B', amountMinor: 18000 },
  { from: 'F', to: 'B', amountMinor: 24000 },
];
