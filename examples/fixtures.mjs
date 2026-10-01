import { splitEqual } from '../src/settlement.mjs';

// Deliberately exposes the difference between largest-first greedy and exact.
export const counterexample = [
  { memberId: 'A', balanceMinor: 80_000 },
  { memberId: 'B', balanceMinor: 70_000 },
  { memberId: 'C', balanceMinor: 60_000 },
  { memberId: 'D', balanceMinor: -90_000 },
  { memberId: 'E', balanceMinor: -80_000 },
  { memberId: 'F', balanceMinor: -40_000 },
];

/** Twenty people each paid for one shared purchase; total 10,000,000 VND. */
export function createTwentyPersonLedger() {
  const memberIds = Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const differences = [-90_000, -80_000, -40_000, 80_000, 70_000, 60_000];
  for (let i = 11; i <= 17; i++) differences.push(i * 10_000, -i * 10_000);
  return {
    memberIds,
    expenses: memberIds.map((memberId, i) => {
      const amountMinor = 500_000 + differences[i];
      return {
        id: `expense-${memberId}`,
        amountMinor,
        payers: [{ memberId, amountMinor }],
        shares: splitEqual(amountMinor, memberIds),
      };
    }),
    settlements: [],
  };
}

/** Five group members; only A/B/C share dinner, only B/D share the taxi. */
export function createSubsetLedger() {
  return {
    memberIds: ['A', 'B', 'C', 'D', 'E'],
    expenses: [
      {
        id: 'dinner', amountMinor: 300000,
        payers: [{ memberId: 'A', amountMinor: 300000 }],
        shares: splitEqual(300000, ['A', 'B', 'C']),
      },
      {
        id: 'taxi', amountMinor: 200000,
        payers: [{ memberId: 'D', amountMinor: 200000 }],
        shares: splitEqual(200000, ['B', 'D']),
      },
    ],
    settlements: [],
  };
}
