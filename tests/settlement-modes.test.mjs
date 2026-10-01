import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalances,
  collectSettlements,
  optimizeSettlements,
  suggestSettlements,
} from '../src/settlement.mjs';

const MAX = Number.MAX_SAFE_INTEGER;

function balancesOf(values) {
  return values.map((balanceMinor, index) => ({
    memberId: `P${String(index + 1).padStart(2, '0')}`,
    balanceMinor,
  }));
}

function subsetLedger() {
  return {
    memberIds: ['A', 'B', 'C', 'D', 'E'],
    expenses: [
      {
        id: 'food', amountMinor: 300000,
        payers: [{ memberId: 'A', amountMinor: 300000 }],
        shares: ['A', 'B', 'C'].map(memberId => ({ memberId, amountMinor: 100000 })),
      },
      {
        id: 'taxi', amountMinor: 200000,
        payers: [{ memberId: 'D', amountMinor: 200000 }],
        shares: ['B', 'D'].map(memberId => ({ memberId, amountMinor: 100000 })),
      },
    ],
  };
}

function confirm(transfers, prefix = 'confirmed') {
  return transfers.map((transfer, index) => ({
    ...transfer, id: `${prefix}-${index}`, status: 'confirmed',
  }));
}

// This checks the actual accounting result without relying on which account is
// allowed to send first: a collector can receive and then forward the same money.
function assertClears(balances, plan) {
  const remaining = new Map(balances.map(row => [row.memberId, BigInt(row.balanceMinor)]));
  assert.equal(plan.transactionCount, plan.transfers.length);
  for (const { from, to, amountMinor } of plan.transfers) {
    assert.ok(remaining.has(from) && remaining.has(to));
    assert.notEqual(from, to);
    assert.ok(Number.isSafeInteger(amountMinor) && amountMinor > 0);
    remaining.set(from, remaining.get(from) + BigInt(amountMinor));
    remaining.set(to, remaining.get(to) - BigInt(amountMinor));
  }
  for (const [memberId, value] of remaining) assert.equal(value, 0n, memberId);
}

function assertCollectorPlan(balances, plan) {
  assertClears(balances, plan);
  assert.equal(plan.mode, 'collector');
  assert.equal(plan.optimalityScope, 'selected-collector');
  assert.equal(plan.optimal, true);
  const peers = balances.filter(row => row.balanceMinor !== 0 && row.memberId !== plan.collectorId);
  assert.equal(plan.transactionCount, peers.length);
  const occurrences = new Map(peers.map(row => [row.memberId, 0]));
  for (const transfer of plan.transfers) {
    assert.ok(transfer.from === plan.collectorId || transfer.to === plan.collectorId);
    const peer = transfer.from === plan.collectorId ? transfer.to : transfer.from;
    occurrences.set(peer, occurrences.get(peer) + 1);
  }
  for (const count of occurrences.values()) assert.equal(count, 1);
  assert.deepEqual(plan.phases.map(row => row.phase), ['collect', 'distribute']);
  assert.deepEqual(plan.phases.flatMap(row => row.transfers), plan.transfers);
  assert.ok(plan.phases[0].transfers.every(row => row.to === plan.collectorId));
  assert.ok(plan.phases[1].transfers.every(row => row.from === plan.collectorId));
}

// Independent account-by-account exhaustive search; it does not use subset DP
// or remove pairs as a preprocessing step.
function minimumTransfersOracle(values) {
  const remaining = values.filter(value => value !== 0);
  function search(start) {
    while (start < remaining.length && remaining[start] === 0) start++;
    if (start === remaining.length) return 0;
    let best = Infinity;
    const seen = new Set();
    for (let next = start + 1; next < remaining.length; next++) {
      const before = remaining[next];
      if (before === 0 || (before < 0) === (remaining[start] < 0) || seen.has(before)) continue;
      seen.add(before);
      remaining[next] += remaining[start];
      best = Math.min(best, 1 + search(start + 1));
      remaining[next] = before;
    }
    return best;
  }
  return search(0);
}

test('two expense subsets leave the fifth member uninvolved in direct settlement', () => {
  const ledger = subsetLedger();
  const balances = calculateBalances(ledger);
  assert.deepEqual(balances.map(row => row.balanceMinor), [200000, -200000, -100000, 100000, 0]);
  const direct = suggestSettlements(balances, { mode: 'min-transfers' });
  assert.equal(direct.transactionCount, 2);
  assert.deepEqual(direct.transfers, [
    { from: 'B', to: 'A', amountMinor: 200000 },
    { from: 'C', to: 'D', amountMinor: 100000 },
  ]);
  assertClears(balances, direct);
  assert.ok(calculateBalances({ ...ledger, settlements: confirm(direct.transfers) }).every(row => row.balanceMinor === 0));
});

test('a creditor collector receives first, distributes to other creditors, and keeps their balance', () => {
  const balances = calculateBalances(subsetLedger());
  const plan = collectSettlements(balances, { collectorId: 'A' });
  assertCollectorPlan(balances, plan);
  assert.equal(plan.transactionCount, 3);
  assert.deepEqual(plan.collector, {
    balanceMinor: 200000, receiveMinor: 300000, sendMinor: 100000,
    fundingRequiredMinor: 0, keepMinor: 200000,
  });
  assert.deepEqual(plan.transfers, [
    { from: 'B', to: 'A', amountMinor: 200000 },
    { from: 'C', to: 'A', amountMinor: 100000 },
    { from: 'A', to: 'D', amountMinor: 100000 },
  ]);
});

test('a debtor collector contributes their own outstanding amount without a self transfer', () => {
  const balances = calculateBalances(subsetLedger());
  const plan = collectSettlements(balances, { collectorId: 'B' });
  assertCollectorPlan(balances, plan);
  assert.equal(plan.transactionCount, 3);
  assert.deepEqual(plan.collector, {
    balanceMinor: -200000, receiveMinor: 100000, sendMinor: 300000,
    fundingRequiredMinor: 200000, keepMinor: 0,
  });
});

test('an uninvolved member may act as collector and forwards exactly what they receive', () => {
  const balances = calculateBalances(subsetLedger());
  const plan = suggestSettlements(balances, { mode: 'collector', collectorId: 'E' });
  assertCollectorPlan(balances, plan);
  assert.equal(plan.transactionCount, 4);
  assert.deepEqual(plan.collector, {
    balanceMinor: 0, receiveMinor: 300000, sendMinor: 300000,
    fundingRequiredMinor: 0, keepMinor: 0,
  });
});

test('all settled groups and a single-member group need no collector transfers', () => {
  for (const values of [[0], [0, -0, 0, 0, 0]]) {
    const balances = balancesOf(values);
    const plan = collectSettlements(balances, { collectorId: 'P01' });
    assertCollectorPlan(balances, plan);
    assert.equal(plan.activeMembers, 0);
    assert.deepEqual(plan.collector, {
      balanceMinor: 0, receiveMinor: 0, sendMinor: 0, fundingRequiredMinor: 0, keepMinor: 0,
    });
  }
});

test('collector validation rejects missing identities and invalid accounting input', () => {
  const valid = balancesOf([-10, 10, 0]);
  for (const collectorId of [undefined, null, '', '  ', 1, 'unknown']) {
    assert.throws(() => collectSettlements(valid, { collectorId }), RangeError);
  }
  assert.throws(() => collectSettlements(valid), RangeError);
  assert.throws(() => collectSettlements([], { collectorId: 'P01' }), RangeError);
  for (const balances of [
    null,
    [{ memberId: 'P01', balanceMinor: 1 }],
    [{ memberId: 'P01', balanceMinor: -1 }, { memberId: 'P01', balanceMinor: 1 }],
    balancesOf([-0.5, 0.5]),
    balancesOf([-MAX - 1, MAX + 1]),
    balancesOf([-MAX, -1, MAX, 1]),
  ]) assert.throws(() => collectSettlements(balances, { collectorId: 'P01' }), RangeError);
});

test('collector money totals remain exact when combined receipt and payout volume exceeds safe Number range', () => {
  const balances = balancesOf([-MAX, 0, MAX]);
  const plan = collectSettlements(balances, { collectorId: 'P02' });
  assertCollectorPlan(balances, plan);
  assert.equal(plan.collector.receiveMinor, MAX);
  assert.equal(plan.collector.sendMinor, MAX);
  assert.equal(plan.transfers.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n), 2n * BigInt(MAX));
  for (const collectorId of ['P01', 'P03']) {
    const endpointPlan = collectSettlements(balances, { collectorId });
    assertCollectorPlan(balances, endpointPlan);
    assert.equal(endpointPlan.transactionCount, 1);
  }
});

test('both modes are stable under input reorder and leave frozen inputs unchanged', () => {
  const balances = Object.freeze(calculateBalances(subsetLedger()).map(Object.freeze));
  const reversed = [...balances].reverse();
  for (const options of [
    { mode: 'min-transfers' },
    { mode: 'collector', collectorId: 'A' },
    { mode: 'collector', collectorId: 'E' },
  ]) {
    const frozenOptions = Object.freeze(options);
    assert.deepEqual(suggestSettlements(balances, frozenOptions), suggestSettlements(reversed, frozenOptions));
  }
});

test('the shared selector defaults to direct mode and rejects ambiguous mode options', () => {
  const balances = balancesOf([-10, 10, 0]);
  assert.deepEqual(suggestSettlements(balances), optimizeSettlements(balances));
  assert.deepEqual(suggestSettlements(balances, { mode: 'collector', collectorId: 'P03' }),
    collectSettlements(balances, { collectorId: 'P03' }));
  for (const options of [
    { mode: 'unknown' }, { mode: '' },
    { mode: 'min-transfers', collectorId: 'P01' },
    { mode: 'collector', collectorId: 'P01', exactLimit: 0 },
    { mode: 'collector', collectorId: 'P01', preprocess: false },
    { mode: 'min-transfers', preprocess: 1 },
  ]) assert.throws(() => suggestSettlements(balances, options), RangeError);
});

test('partial collections, pending payouts, and funds already held are handled on recomputation', () => {
  const ledger = subsetLedger();
  const partial = { id: 'partial', from: 'B', to: 'A', amountMinor: 75000, status: 'confirmed' };
  const afterPartial = calculateBalances({ ...ledger, settlements: [partial] });
  const partialPlan = collectSettlements(afterPartial, { collectorId: 'A' });
  assert.equal(partialPlan.collector.receiveMinor, 225000);
  assert.equal(partialPlan.collector.keepMinor, 125000);
  assertCollectorPlan(afterPartial, partialPlan);

  const collected = [
    partial,
    { id: 'rest-B', from: 'B', to: 'A', amountMinor: 125000, status: 'confirmed' },
    { id: 'all-C', from: 'C', to: 'A', amountMinor: 100000, status: 'confirmed' },
    { id: 'pending-D', from: 'A', to: 'D', amountMinor: 100000, status: 'pending' },
  ];
  const afterCollection = calculateBalances({ ...ledger, settlements: collected });
  const payoutPlan = collectSettlements(afterCollection, { collectorId: 'A' });
  assertCollectorPlan(afterCollection, payoutPlan);
  assert.deepEqual(payoutPlan.transfers, [{ from: 'A', to: 'D', amountMinor: 100000 }]);
  // This is money A must provide beyond future receipts; it can come from the
  // previous confirmed collections, so it is not necessarily new personal cash.
  assert.equal(payoutPlan.collector.fundingRequiredMinor, 100000);
  assert.equal(payoutPlan.collector.receiveMinor, 0);
  const paid = collected.map(row => row.id === 'pending-D' ? { ...row, status: 'confirmed' } : row);
  assert.ok(calculateBalances({ ...ledger, settlements: paid }).every(row => row.balanceMinor === 0));
});

test('opposite-pair preprocessing preserves the true minimum in 300 independently checked small groups', () => {
  let seed = 0x52b7c;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let sample = 0; sample < 300; sample++) {
    const size = 2 + next() % 8;
    const values = Array.from({ length: size - 1 }, () => (next() % 31) - 15);
    values.push(-values.reduce((sum, value) => sum + value, 0));
    if (sample % 2 === 0 && size >= 4) {
      values[0] = 1 + next() % 15;
      values[1] = -values[0];
      values[size - 1] = -values.slice(0, -1).reduce((sum, value) => sum + value, 0);
    }
    const balances = balancesOf(values);
    const expected = minimumTransfersOracle(values);
    for (const preprocess of [true, false]) {
      const plan = optimizeSettlements(balances, { preprocess });
      assert.equal(plan.optimal, true);
      assert.equal(plan.transactionCount, expected, `${values}, preprocess=${preprocess}`);
      assert.equal(plan.lowerBound, expected);
      assertClears(balances, plan);
    }
  }
});

test('a 206-member group becomes exactly solvable after 101 opposite pairs are removed', () => {
  const values = [8, 7, 6, -9, -8, -4];
  for (let index = 0; index < 100; index++) values.push(1000000 + index, -1000000 - index);
  const balances = balancesOf(values);
  const plan = optimizeSettlements(balances);
  assert.equal(plan.activeMembers, 206);
  assert.equal(plan.pairedMembers, 202);
  assert.equal(plan.remainingMembers, 4);
  assert.equal(plan.transactionCount, 100 + minimumTransfersOracle(values.slice(0, 6)));
  assert.equal(plan.optimal, true);
  assert.equal(plan.proof, 'subset-dp');
  assertClears(balances, plan);
});

test('a lower-bound proof certifies a 51-member group without subset DP or pair preprocessing', () => {
  const balances = balancesOf([-1275, ...Array.from({ length: 50 }, (_, index) => index + 1)]);
  const plan = optimizeSettlements(balances, { exactLimit: 0, preprocess: false });
  assert.equal(plan.optimal, true);
  assert.equal(plan.proof, 'lower-bound');
  assert.equal(plan.transactionCount, 50);
  assert.equal(plan.lowerBound, 50);
  assertClears(balances, plan);
});

test('a 25-member unresolved group returns a valid fallback without claiming global optimality', () => {
  const values = [1, 10, 100, 1000, 10000].flatMap(scale => [8, 7, 6, -9, -12].map(value => value * scale));
  const balances = balancesOf(values);
  const plan = optimizeSettlements(balances);
  assert.equal(plan.pairedMembers, 0);
  assert.equal(plan.remainingMembers, 25);
  assert.equal(plan.optimal, false);
  assert.equal(plan.proof, 'not-certified');
  assert.equal(plan.method, 'greedy');
  assert.ok(plan.transactionCount > plan.lowerBound);
  assertClears(balances, plan);
});

test('a 20-member group with 19 variable-subset expenses clears in either mode with any selected collector', () => {
  const memberIds = Array.from({ length: 20 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
  const expenses = Array.from({ length: 19 }, (_, index) => {
    const count = 2 + index % 4;
    const perPerson = 1000 * (index + 1);
    return {
      id: `subset-${index}`,
      amountMinor: count * perPerson,
      payers: [{ memberId: memberIds[index], amountMinor: count * perPerson }],
      shares: Array.from({ length: count }, (_, offset) => ({
        memberId: memberIds[(index + offset + 1) % 19], amountMinor: perPerson,
      })),
    };
  });
  const ledger = { memberIds, expenses };
  const balances = calculateBalances(ledger);
  assert.equal(balances.length, 20);
  assert.equal(balances.find(row => row.memberId === 'P20').balanceMinor, 0);
  assert.deepEqual([...new Set(expenses.map(row => row.shares.length))].sort(), [2, 3, 4, 5]);
  assert.ok(expenses.every(row => !row.shares.some(share => share.memberId === row.payers[0].memberId)));
  const plans = [suggestSettlements(balances), ...memberIds.map(collectorId =>
    suggestSettlements(balances, { mode: 'collector', collectorId }))];
  assert.equal(plans[0].optimal, true);
  assert.ok(plans[0].transfers.every(row => row.from !== 'P20' && row.to !== 'P20'));
  for (const [index, plan] of plans.entries()) {
    if (plan.mode === 'collector') assertCollectorPlan(balances, plan);
    else assertClears(balances, plan);
    const settled = calculateBalances({ ...ledger, settlements: confirm(plan.transfers, `plan-${index}`) });
    assert.ok(settled.every(row => row.balanceMinor === 0));
  }
});
