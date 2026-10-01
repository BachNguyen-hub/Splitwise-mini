import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitEqual,
  splitWeighted,
  calculateBalances,
  optimizeSettlements,
} from '../src/settlement.mjs';
import { createTwentyPersonLedger } from '../examples/fixtures.mjs';
import {
  createAuditLedger,
  websiteBaselineTransfers,
  websiteAfterPartialTransfers,
} from '../examples/chiahoadon-audit-fixture.mjs';

const MAX = Number.MAX_SAFE_INTEGER;

test('authenticated website fixtures settle in four transfers instead of the five observed', () => {
  const cases = [
    { afterPartialPayment: false, expectedBalances: [48000, 42000, 36000, -54000, -48000, -24000], observed: websiteBaselineTransfers },
    { afterPartialPayment: true, expectedBalances: [42000, 42000, 36000, -54000, -42000, -24000], observed: websiteAfterPartialTransfers },
  ];
  for (const { afterPartialPayment, expectedBalances, observed } of cases) {
    const ledger = createAuditLedger({ afterPartialPayment });
    const balances = calculateBalances(ledger);
    assert.deepEqual(balances.map(row => row.balanceMinor), expectedBalances);
    assertSettles(balances, { transfers: observed, transactionCount: observed.length, activeMembers: 6 });
    assert.equal(observed.length, 5);
    const result = optimizeSettlements(balances);
    assert.equal(result.transactionCount, 4);
    assert.equal(result.optimal, true);
    assert.equal(result.transactionCount, minimumTransfersOracle(expectedBalances));
    assertSettles(balances, result);
  }
});

function balancesOf(values) {
  return values.map((balanceMinor, index) => ({
    memberId: `member-${String(index).padStart(2, '0')}`,
    balanceMinor,
  }));
}

function assertSettles(balances, result) {
  const original = new Map(balances.map(({ memberId, balanceMinor }) => [memberId, balanceMinor]));
  const remaining = new Map([...original].map(([id, balance]) => [id, BigInt(balance)]));
  let transferred = 0n;
  assert.equal(result.transactionCount, result.transfers.length);
  assert.equal(result.activeMembers, balances.filter(({ balanceMinor }) => balanceMinor !== 0).length);
  for (const { from, to, amountMinor } of result.transfers) {
    assert.ok(original.has(from), `Unknown sender ${from}`);
    assert.ok(original.has(to), `Unknown recipient ${to}`);
    assert.notEqual(from, to);
    assert.ok(Number.isSafeInteger(amountMinor) && amountMinor > 0);
    assert.ok(original.get(from) < 0, 'Only original net debtors send money');
    assert.ok(original.get(to) > 0, 'Only original net creditors receive money');
    remaining.set(from, remaining.get(from) + BigInt(amountMinor));
    remaining.set(to, remaining.get(to) - BigInt(amountMinor));
    transferred += BigInt(amountMinor);
  }
  for (const [memberId, balance] of remaining) {
    assert.equal(balance, 0n, `Unsettled member ${memberId}`);
  }
  const required = balances.reduce((sum, row) => sum + (row.balanceMinor > 0 ? BigInt(row.balanceMinor) : 0n), 0n);
  assert.equal(transferred, required, 'No unnecessary money passes through intermediaries');
}

// Independent search: clear the first unsettled account against every opposite
// account. This does not use subset sums or the production DP recurrence.
function minimumTransfersOracle(values) {
  const remaining = values.filter((value) => value !== 0);
  function search(start) {
    while (start < remaining.length && remaining[start] === 0) start += 1;
    if (start === remaining.length) return 0;
    let best = Infinity;
    const seen = new Set();
    for (let index = start + 1; index < remaining.length; index += 1) {
      if ((remaining[start] < 0) === (remaining[index] < 0) || remaining[index] === 0 || seen.has(remaining[index])) continue;
      const previous = remaining[index];
      seen.add(previous);
      remaining[index] += remaining[start];
      best = Math.min(best, 1 + search(start + 1));
      remaining[index] = previous;
      if (previous + remaining[start] === 0) break;
    }
    return best;
  }
  return search(0);
}

function oneExpense(overrides = {}) {
  return {
    id: 'expense-1',
    amountMinor: 300,
    payers: [{ memberId: 'a', amountMinor: 300 }],
    shares: [
      { memberId: 'a', amountMinor: 100 },
      { memberId: 'b', amountMinor: 100 },
      { memberId: 'c', amountMinor: 100 },
    ],
    ...overrides,
  };
}

function simpleLedger(overrides = {}) {
  return { memberIds: ['c', 'a', 'b'], expenses: [oneExpense()], ...overrides };
}

test('equal split preserves every dong and resolves the remainder by member ID', () => {
  const ids = ['c', 'a', 'b'];
  assert.deepEqual(splitEqual(100000, ids), [
    { memberId: 'a', amountMinor: 33334 },
    { memberId: 'b', amountMinor: 33333 },
    { memberId: 'c', amountMinor: 33333 },
  ]);
  assert.deepEqual(ids, ['c', 'a', 'b']);
  assert.deepEqual(splitEqual(2, ['c', 'a', 'b']), [
    { memberId: 'a', amountMinor: 1 },
    { memberId: 'b', amountMinor: 1 },
    { memberId: 'c', amountMinor: 0 },
  ]);
});

test('equal split is exact at the largest supported integer', () => {
  const shares = splitEqual(MAX, ['b', 'a']);
  assert.deepEqual(shares, [
    { memberId: 'a', amountMinor: 4503599627370496 },
    { memberId: 'b', amountMinor: 4503599627370495 },
  ]);
});

test('weighted split uses largest remainder and stable ID ties', () => {
  const weighted = [{ memberId: 'c', weight: 1 }, { memberId: 'a', weight: 2 }, { memberId: 'b', weight: 1 }];
  const before = structuredClone(weighted);
  assert.deepEqual(splitWeighted(7, weighted), [
    { memberId: 'a', amountMinor: 3 },
    { memberId: 'b', amountMinor: 2 },
    { memberId: 'c', amountMinor: 2 },
  ]);
  assert.deepEqual(weighted, before);
  assert.deepEqual(splitWeighted(1, [{ memberId: 'b', weight: 1 }, { memberId: 'a', weight: 1 }]), [
    { memberId: 'a', amountMinor: 1 },
    { memberId: 'b', amountMinor: 0 },
  ]);
});

test('weighted split safely handles products larger than Number.MAX_SAFE_INTEGER', () => {
  assert.deepEqual(splitWeighted(MAX, [{ memberId: 'b', weight: 3 }, { memberId: 'a', weight: 2 }]), [
    { memberId: 'a', amountMinor: 3602879701896396 },
    { memberId: 'b', amountMinor: 5404319552844595 },
  ]);
});

test('zero weights receive zero while positive weights receive the full amount', () => {
  assert.deepEqual(splitWeighted(123, [{ memberId: 'b', weight: 1 }, { memberId: 'a', weight: 0 }]), [
    { memberId: 'a', amountMinor: 0 },
    { memberId: 'b', amountMinor: 123 },
  ]);
});

test('splitting rejects malformed amounts, members, and weights', () => {
  for (const amount of [-1, 0.5, NaN, Infinity, MAX + 1, '100']) {
    assert.throws(() => splitEqual(amount, ['a', 'b']));
    assert.throws(() => splitWeighted(amount, [{ memberId: 'a', weight: 1 }]));
  }
  assert.throws(() => splitEqual(100, []));
  assert.throws(() => splitEqual(100, ['a', 'a']));
  assert.throws(() => splitWeighted(100, []));
  assert.throws(() => splitWeighted(100, [{ memberId: 'a', weight: 0 }]));
  assert.throws(() => splitWeighted(100, [{ memberId: 'a', weight: 1 }, { memberId: 'a', weight: 2 }]));
  for (const weight of [-1, 0.5, NaN, Infinity, MAX + 1, '1']) {
    assert.throws(() => splitWeighted(100, [{ memberId: 'a', weight }]));
  }
});

test('balances combine multiple payers and per-expense participant subsets', () => {
  const input = simpleLedger({ expenses: [oneExpense(), oneExpense({
    id: 'taxi', amountMinor: 90,
    payers: [{ memberId: 'b', amountMinor: 60 }, { memberId: 'c', amountMinor: 30 }],
    shares: [{ memberId: 'b', amountMinor: 45 }, { memberId: 'c', amountMinor: 45 }],
  })] });
  const before = structuredClone(input);
  assert.deepEqual(calculateBalances(input), [
    { memberId: 'a', balanceMinor: 200 },
    { memberId: 'b', balanceMinor: -85 },
    { memberId: 'c', balanceMinor: -115 },
  ]);
  assert.deepEqual(input, before);
});

test('a payer need not participate in the expense they paid', () => {
  assert.deepEqual(calculateBalances(simpleLedger({ expenses: [oneExpense({
    shares: [{ memberId: 'b', amountMinor: 150 }, { memberId: 'c', amountMinor: 150 }],
  })] })), [
    { memberId: 'a', balanceMinor: 300 },
    { memberId: 'b', balanceMinor: -150 },
    { memberId: 'c', balanceMinor: -150 },
  ]);
});

test('only confirmed transfers affect balances; recomputing does not apply them twice', () => {
  const input = simpleLedger({ settlements: [
    { id: 'paid', from: 'b', to: 'a', amountMinor: 100, status: 'confirmed' },
    { id: 'waiting', from: 'c', to: 'a', amountMinor: 100, status: 'pending' },
    { id: 'declined', from: 'c', to: 'a', amountMinor: 100, status: 'rejected' },
  ] });
  const before = structuredClone(input);
  const expected = [
    { memberId: 'a', balanceMinor: 100 },
    { memberId: 'b', balanceMinor: 0 },
    { memberId: 'c', balanceMinor: -100 },
  ];
  assert.deepEqual(calculateBalances(input), expected);
  assert.deepEqual(calculateBalances(input), expected);
  assert.deepEqual(input, before);
});

test('empty ledgers include zero balances and create no transfers', () => {
  const balances = calculateBalances({ memberIds: ['b', 'a'], expenses: [] });
  assert.deepEqual(balances, [{ memberId: 'a', balanceMinor: 0 }, { memberId: 'b', balanceMinor: 0 }]);
  for (const input of [[], balances]) {
    const result = optimizeSettlements(input, { exactLimit: 0 });
    assert.equal(result.optimal, true);
    assert.equal(result.transactionCount, 0);
    assertSettles(input, result);
  }
});

test('expense validation rejects duplicated or unknown members and inconsistent totals', () => {
  assert.throws(() => calculateBalances(simpleLedger({ memberIds: ['a', 'a', 'b', 'c'] })));
  assert.throws(() => calculateBalances(simpleLedger({ expenses: [oneExpense(), oneExpense()] })));
  const invalid = [
    { amountMinor: 0 }, { amountMinor: -1 }, { amountMinor: 1.5 }, { amountMinor: MAX + 1 },
    { payers: [] }, { shares: [] },
    { payers: [{ memberId: 'a', amountMinor: 299 }] },
    { shares: [{ memberId: 'a', amountMinor: 299 }] },
    { payers: [{ memberId: 'unknown', amountMinor: 300 }] },
    { shares: [{ memberId: 'unknown', amountMinor: 300 }] },
    { payers: [{ memberId: 'a', amountMinor: 150 }, { memberId: 'a', amountMinor: 150 }] },
    { shares: [{ memberId: 'b', amountMinor: 150 }, { memberId: 'b', amountMinor: 150 }] },
    { payers: [{ memberId: 'a', amountMinor: -1 }, { memberId: 'b', amountMinor: 301 }] },
    { shares: [{ memberId: 'a', amountMinor: -1 }, { memberId: 'b', amountMinor: 301 }] },
    { payers: [{ memberId: 'a', amountMinor: 300.5 }] },
    { shares: [{ memberId: 'a', amountMinor: NaN }] },
  ];
  for (const overrides of invalid) {
    assert.throws(() => calculateBalances(simpleLedger({ expenses: [oneExpense(overrides)] })));
  }
});

test('settlement validation rejects duplicate IDs and invalid transfer records', () => {
  const settlement = { id: 'transfer', from: 'b', to: 'a', amountMinor: 100, status: 'confirmed' };
  assert.throws(() => calculateBalances(simpleLedger({ settlements: [settlement, { ...settlement }] })));
  for (const overrides of [
    { from: 'unknown' }, { to: 'unknown' }, { to: 'b' },
    { amountMinor: 0 }, { amountMinor: -1 }, { amountMinor: 0.5 },
    { amountMinor: MAX + 1 }, { amountMinor: Infinity }, { status: 'unknown' },
  ]) {
    assert.throws(() => calculateBalances(simpleLedger({ settlements: [{ ...settlement, ...overrides }] })));
  }
});

test('ledger aggregation remains exact when large intermediate totals later cancel', () => {
  function expense(id, from, to, amountMinor) {
    return { id, amountMinor, payers: [{ memberId: to, amountMinor }], shares: [{ memberId: from, amountMinor }] };
  }
  const expenses = [
    expense('e1', 'b', 'a', MAX), expense('e2', 'b', 'a', MAX),
    expense('e3', 'a', 'b', MAX), expense('e4', 'a', 'b', MAX - 1),
  ];
  assert.deepEqual(calculateBalances({ memberIds: ['a', 'b'], expenses }), [
    { memberId: 'a', balanceMinor: 1 }, { memberId: 'b', balanceMinor: -1 },
  ]);
  assert.throws(() => calculateBalances({ memberIds: ['a', 'b'], expenses: expenses.slice(0, 2) }));
  assert.throws(() => calculateBalances({ memberIds: ['a', 'b', 'c', 'd'], expenses: [
    expense('e1', 'c', 'a', MAX), expense('e2', 'd', 'b', MAX),
  ] }));
});

test('exact optimization improves the largest-debt/largest-credit greedy counterexample', () => {
  const balances = balancesOf([8, 7, 6, -9, -8, -4]);
  const exact = optimizeSettlements(balances);
  const greedy = optimizeSettlements(balances, { exactLimit: 0, preprocess: false });
  assert.equal(exact.transactionCount, 4);
  assert.equal(exact.optimal, true);
  assert.equal(exact.method, 'exact');
  assert.equal(greedy.transactionCount, 5);
  assert.equal(greedy.optimal, false);
  assert.equal(greedy.method, 'greedy');
  assertSettles(balances, exact);
  assertSettles(balances, greedy);
});

test('exact and greedy plans are deterministic under input reordering and do not mutate balances', () => {
  const balances = balancesOf([8, 7, 6, -9, -8, -4, 0]);
  const before = structuredClone(balances);
  for (const exactLimit of [0, 20]) {
    const result = optimizeSettlements(balances, { exactLimit });
    assert.deepEqual(result, optimizeSettlements([...balances].reverse(), { exactLimit }));
    assert.deepEqual(result, optimizeSettlements(balances, { exactLimit }));
    assert.deepEqual(balances, before);
    assertSettles(balances, result);
  }
});

test('20 active members receive a guaranteed optimum with ten independent equal pairs', () => {
  const balances = balancesOf([...Array(10).fill(-100), ...Array(10).fill(100)]);
  const result = optimizeSettlements(balances);
  assert.equal(result.transactionCount, 10);
  assert.equal(result.optimal, true);
  assert.equal(result.method, 'exact');
  assertSettles(balances, result);
});

test('a lower-bound proof can certify small and large groups without exponential search', () => {
  const atLimit = balancesOf([-2, 1, 1, ...Array(30).fill(0)]);
  const exact = optimizeSettlements(atLimit, { exactLimit: 3 });
  assert.equal(exact.method, 'greedy');
  assert.equal(exact.proof, 'lower-bound');
  assert.equal(exact.optimal, true);
  assertSettles(atLimit, exact);
  const aboveLimit = balancesOf([-20, ...Array(20).fill(1)]);
  const greedy = optimizeSettlements(aboveLimit);
  assert.equal(greedy.method, 'greedy');
  assert.equal(greedy.optimal, true);
  assert.equal(greedy.lowerBound, 20);
  assert.equal(greedy.transactionCount, 20);
  assertSettles(aboveLimit, greedy);
});

test('settlement handles the largest safe total without losing a unit', () => {
  const balances = balancesOf([-MAX, MAX - 1, 1]);
  for (const exactLimit of [0, 20]) {
    const result = optimizeSettlements(balances, { exactLimit });
    assert.equal(result.transactionCount, 2);
    assertSettles(balances, result);
  }
});

test('settlement rejects unbalanced, unsafe, duplicate, and invalid cutoff inputs', () => {
  assert.throws(() => optimizeSettlements(balancesOf([1, -2])));
  assert.throws(() => optimizeSettlements(balancesOf([MAX, MAX, -MAX, -MAX])));
  assert.throws(() => optimizeSettlements([{ memberId: 'a', balanceMinor: 1 }, { memberId: 'a', balanceMinor: -1 }]));
  for (const amount of [0.5, NaN, Infinity, MAX + 1, '1']) {
    assert.throws(() => optimizeSettlements([{ memberId: 'a', balanceMinor: amount }]));
  }
  for (const exactLimit of [-1, 21, 1.5, NaN, Infinity, '20']) {
    assert.throws(() => optimizeSettlements(balancesOf([-1, 1]), { exactLimit }));
  }
});

test('300 seeded small cases agree with an independent optimality oracle and conserve all balances', () => {
  let seed = 78231;
  function random(max) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed % max;
  }
  for (let sample = 0; sample < 300; sample += 1) {
    const count = 2 + random(7);
    const values = Array.from({ length: count - 1 }, () => random(41) - 20);
    values.push(-values.reduce((sum, value) => sum + value, 0));
    const balances = balancesOf(values);
    const before = structuredClone(balances);
    const exact = optimizeSettlements(balances);
    assert.equal(exact.transactionCount, minimumTransfersOracle(values), `Wrong optimum for ${JSON.stringify(values)}`);
    assert.equal(exact.optimal, true);
    assertSettles(balances, exact);
    const greedy = optimizeSettlements(balances, { exactLimit: 0, preprocess: false });
    assert.ok(greedy.transactionCount >= exact.transactionCount);
    assert.ok(greedy.transactionCount <= Math.max(0, greedy.activeMembers - 1));
    assertSettles(balances, greedy);
    assert.deepEqual(balances, before);
  }
});

test('the 20-person outing settles its entire 10-million-dong ledger in 11 optimal transfers', () => {
  const ledger = createTwentyPersonLedger();
  assert.equal(ledger.memberIds.length, 20);
  assert.equal(ledger.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0), 10000000);
  const paidByMember = new Map(ledger.memberIds.map((memberId) => [memberId, 0]));
  for (const expense of ledger.expenses) {
    for (const payer of expense.payers) {
      paidByMember.set(payer.memberId, paidByMember.get(payer.memberId) + payer.amountMinor);
    }
  }
  const balances = calculateBalances(ledger);
  for (const { memberId, balanceMinor } of balances) {
    assert.equal(balanceMinor, paidByMember.get(memberId) - 500000, `${memberId} must bear exactly 500,000 dong`);
  }
  const greedy = optimizeSettlements(balances, { exactLimit: 0, preprocess: false });
  const exact = optimizeSettlements(balances);
  assert.equal(greedy.transactionCount, 12);
  assert.equal(exact.transactionCount, 11);
  assert.equal(exact.optimal, true);
  assertSettles(balances, greedy);
  assertSettles(balances, exact);
  const settledBalances = calculateBalances({
    ...ledger,
    settlements: exact.transfers.map((transfer, index) => ({
      id: `outing-confirmed-${index}`, ...transfer, status: 'confirmed',
    })),
  });
  assert.deepEqual(settledBalances, ledger.memberIds.map((memberId) => ({ memberId, balanceMinor: 0 })));
  assert.equal(optimizeSettlements(settledBalances).transactionCount, 0);
});

test('partial payments leave only the confirmed residual; actual overpayments reverse who is owed', () => {
  const ledger = simpleLedger({ settlements: [
    { id: 'partial', from: 'b', to: 'a', amountMinor: 40, status: 'confirmed' },
    { id: 'still-pending', from: 'b', to: 'a', amountMinor: 60, status: 'pending' },
  ] });
  const residual = calculateBalances(ledger);
  assert.deepEqual(residual, [
    { memberId: 'a', balanceMinor: 160 },
    { memberId: 'b', balanceMinor: -60 },
    { memberId: 'c', balanceMinor: -100 },
  ]);
  const plan = optimizeSettlements(residual);
  assertSettles(residual, plan);
  const cleared = calculateBalances({
    ...ledger,
    settlements: [...ledger.settlements, ...plan.transfers.map((transfer, index) => ({
      id: `residual-confirmed-${index}`, ...transfer, status: 'confirmed',
    }))],
  });
  assert.ok(cleared.every(({ balanceMinor }) => balanceMinor === 0));

  const overpaidLedger = simpleLedger({ settlements: [
    { id: 'overpaid', from: 'b', to: 'a', amountMinor: 150, status: 'confirmed' },
  ] });
  const overpaidBalances = calculateBalances(overpaidLedger);
  assert.deepEqual(overpaidBalances, [
    { memberId: 'a', balanceMinor: 50 },
    { memberId: 'b', balanceMinor: 50 },
    { memberId: 'c', balanceMinor: -100 },
  ]);
  const correction = optimizeSettlements(overpaidBalances);
  assert.ok(correction.transfers.some(({ to, amountMinor }) => to === 'b' && amountMinor === 50));
  assertSettles(overpaidBalances, correction);
  const corrected = calculateBalances({
    ...overpaidLedger,
    settlements: [...overpaidLedger.settlements, ...correction.transfers.map((transfer, index) => ({
      id: `correction-confirmed-${index}`, ...transfer, status: 'confirmed',
    }))],
  });
  assert.ok(corrected.every(({ balanceMinor }) => balanceMinor === 0));
});
