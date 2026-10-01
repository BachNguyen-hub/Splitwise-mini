/**
 * Pure, framework-independent expense math. Amounts are integer minor units:
 * VND uses dong; a currency with two decimals uses cents. One currency per call.
 * Positive balance = receivable, negative balance = payable.
 */
export const MAX_EXACT_MEMBERS = 20;
const MAX_MONEY = BigInt(Number.MAX_SAFE_INTEGER);

function assert(condition, message) {
  if (!condition) throw new RangeError(message);
}

function requireArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
}

function requireId(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0,
    `${label} must be a nonempty string`);
}

function requireInteger(value, label, minimum = 0) {
  assert(Number.isSafeInteger(value) && value >= minimum,
    `${label} must be a safe integer >= ${minimum}`);
}

function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function claimId(seen, id, label) {
  requireId(id, label);
  assert(!seen.has(id), `${label} must be unique: ${id}`);
  seen.add(id);
}

function toSafeMoney(value, label) {
  assert(value >= -MAX_MONEY && value <= MAX_MONEY, `${label} exceeds safe integer range`);
  return Number(value);
}

/** Equal allocation; remainder goes to ascending member IDs, independent of UI order. */
export function splitEqual(amountMinor, participantIds) {
  requireArray(participantIds, 'participantIds');
  return splitWeighted(amountMinor, participantIds.map(memberId => ({ memberId, weight: 1 })));
}

/**
 * Largest-remainder allocation with exact BigInt multiplication and division.
 * Integer weights can represent portions or basis points (12.5% = 1250/10000).
 * A percentage UI must validate that its weights add to 10000 before calling.
 */
export function splitWeighted(amountMinor, participants) {
  requireInteger(amountMinor, 'amountMinor');
  requireArray(participants, 'participants');
  assert(participants.length > 0, 'participants must not be empty');
  const seen = new Set();
  const rows = participants.map(row => {
    claimId(seen, row?.memberId, 'participant memberId');
    requireInteger(row.weight, 'weight');
    return { memberId: row.memberId, weight: BigInt(row.weight) };
  }).sort((a, b) => compareIds(a.memberId, b.memberId));
  const weightSum = rows.reduce((sum, row) => sum + row.weight, 0n);
  assert(weightSum > 0n, 'total weight must be positive');
  let allocated = 0n;
  for (const row of rows) {
    const numerator = BigInt(amountMinor) * row.weight;
    row.amount = numerator / weightSum;
    row.remainder = numerator % weightSum;
    allocated += row.amount;
  }
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder
    ? compareIds(a.memberId, b.memberId) : a.remainder > b.remainder ? -1 : 1);
  const remaining = Number(BigInt(amountMinor) - allocated);
  for (let i = 0; i < remaining; i++) ranked[i].amount += 1n;
  return rows.map(row => ({ memberId: row.memberId, amountMinor: Number(row.amount) }));
}

/**
 * Recompute a ledger snapshot. Expenses contain explicit payers and shares.
 * Transfers are actual recorded repayments, never suggestions from the optimizer.
 * Only confirmed transfers change balances. IDs must be unique within each list.
 */
export function calculateBalances({ memberIds, expenses, settlements = [] }) {
  requireArray(memberIds, 'memberIds');
  requireArray(expenses, 'expenses');
  requireArray(settlements, 'settlements');
  const memberSet = new Set();
  for (const id of memberIds) claimId(memberSet, id, 'memberId');
  const ledger = new Map([...memberSet].map(id => [id, 0n]));
  const validateMember = id => {
    requireId(id, 'memberId');
    assert(memberSet.has(id), `Unknown member: ${id}`);
  };
  const applyRows = (rows, total, direction, label) => {
    requireArray(rows, label);
    assert(rows.length > 0, `${label} must not be empty`);
    const seen = new Set();
    let sum = 0n;
    for (const row of rows) {
      claimId(seen, row?.memberId, `${label} memberId`);
      validateMember(row.memberId);
      requireInteger(row.amountMinor, `${label} amountMinor`);
      const value = BigInt(row.amountMinor);
      sum += value;
      ledger.set(row.memberId, ledger.get(row.memberId) + direction * value);
    }
    assert(sum === BigInt(total), `${label} amounts must sum to expense amountMinor`);
  };
  const expenseIds = new Set();
  for (const expense of expenses) {
    claimId(expenseIds, expense?.id, 'expense id');
    requireInteger(expense.amountMinor, 'expense amountMinor', 1);
    applyRows(expense.payers, expense.amountMinor, 1n, 'payers');
    applyRows(expense.shares, expense.amountMinor, -1n, 'shares');
  }
  const settlementIds = new Set();
  for (const settlement of settlements) {
    claimId(settlementIds, settlement?.id, 'settlement id');
    validateMember(settlement.from);
    validateMember(settlement.to);
    assert(settlement.from !== settlement.to, 'Cannot settle with yourself');
    requireInteger(settlement.amountMinor, 'settlement amountMinor', 1);
    assert(['pending', 'confirmed', 'rejected'].includes(settlement.status),
      'Invalid settlement status');
    if (settlement.status !== 'confirmed') continue;
    const amount = BigInt(settlement.amountMinor);
    ledger.set(settlement.from, ledger.get(settlement.from) + amount);
    ledger.set(settlement.to, ledger.get(settlement.to) - amount);
  }
  return normalizeBalances([...ledger].map(([memberId, balance]) => ({
    memberId, balanceMinor: toSafeMoney(balance, `Balance for ${memberId}`),
  })));
}

function normalizeBalances(balances) {
  requireArray(balances, 'balances');
  const seen = new Set();
  let sum = 0n;
  let positiveSum = 0n;
  const result = balances.map(row => {
    claimId(seen, row?.memberId, 'balance memberId');
    requireInteger(row.balanceMinor, 'balanceMinor', -Number.MAX_SAFE_INTEGER);
    const value = BigInt(row.balanceMinor);
    sum += value;
    if (value > 0n) positiveSum += value;
    return { memberId: row.memberId, balanceMinor: row.balanceMinor || 0 };
  }).sort((a, b) => compareIds(a.memberId, b.memberId));
  assert(sum === 0n, 'Balances must sum to zero');
  // Every subset sum is now within [-positiveSum, positiveSum], so the DP can
  // store integers exactly in Float64Array even though its storage is floating point.
  assert(positiveSum <= MAX_MONEY, 'Total positive balance exceeds safe integer range');
  return result;
}

// Largest outstanding amount first, with a stable ID tie-break.
class MaxHeap {
  #items = [];

  get size() { return this.#items.length; }

  #before(a, b) {
    return a.amount > b.amount || (a.amount === b.amount && compareIds(a.id, b.id) < 0);
  }

  push(item) {
    const items = this.#items;
    let i = items.length;
    items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.#before(item, items[parent])) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = item;
  }

  pop() {
    const items = this.#items;
    const first = items[0];
    const last = items.pop();
    if (items.length === 0) return first;
    let i = 0;
    while (i * 2 + 1 < items.length) {
      let child = i * 2 + 1;
      if (child + 1 < items.length && this.#before(items[child + 1], items[child])) child++;
      if (!this.#before(items[child], last)) break;
      items[i] = items[child];
      i = child;
    }
    items[i] = last;
    return first;
  }
}

function greedyTransfers(balances) {
  const debtors = new MaxHeap();
  const creditors = new MaxHeap();
  for (const { memberId, balanceMinor } of balances) {
    if (balanceMinor === 0) continue;
    (balanceMinor < 0 ? debtors : creditors).push({ id: memberId, amount: Math.abs(balanceMinor) });
  }
  const transfers = [];
  while (debtors.size && creditors.size) {
    const debtor = debtors.pop();
    const creditor = creditors.pop();
    const amountMinor = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amountMinor });
    debtor.amount -= amountMinor;
    creditor.amount -= amountMinor;
    if (debtor.amount > 0) debtors.push(debtor);
    if (creditor.amount > 0) creditors.push(creditor);
  }
  return transfers;
}

function exactTransfers(balances) {
  const size = 1 << balances.length;
  const sums = new Float64Array(size);
  const groups = new Uint8Array(size);
  const lastMember = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const bit = mask & -mask;
    const member = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit] + balances[member].balanceMinor;
    // Maximum number of zero-sum prefixes over all orderings of this subset.
    let best = -1;
    let chosen = 0;
    for (let rest = mask; rest; rest &= rest - 1) {
      const candidateBit = rest & -rest;
      const candidate = groups[mask ^ candidateBit];
      if (candidate > best) {
        best = candidate;
        chosen = 31 - Math.clz32(candidateBit);
      }
    }
    groups[mask] = best + (sums[mask] === 0 ? 1 : 0);
    lastMember[mask] = chosen;
  }

  // Reconstruct the optimal ordering, then cut at every zero-sum prefix.
  const ordering = [];
  for (let mask = size - 1; mask;) {
    const member = lastMember[mask];
    ordering.push(balances[member]);
    mask ^= 1 << member;
  }
  ordering.reverse();
  const transfers = [];
  let block = [];
  let blockSum = 0;
  for (const row of ordering) {
    block.push(row);
    blockSum += row.balanceMinor;
    if (blockSum === 0) {
      transfers.push(...greedyTransfers(block));
      block = [];
    }
  }
  return transfers;
}

// Isolating (+x, -x) preserves the global optimum. If they occur in separate
// zero-sum blocks, replace those blocks by the pair and their remaining union.
function extractEqualPairs(balances) {
  const waiting = new Map();
  const matched = new Set();
  const transfers = [];
  for (const row of balances) {
    const opposite = waiting.get(-row.balanceMinor);
    if (opposite?.length) {
      const other = opposite.pop();
      matched.add(row.memberId);
      matched.add(other.memberId);
      const [debtor, creditor] = row.balanceMinor < 0 ? [row, other] : [other, row];
      transfers.push({ from: debtor.memberId, to: creditor.memberId, amountMinor: creditor.balanceMinor });
    } else {
      if (!waiting.has(row.balanceMinor)) waiting.set(row.balanceMinor, []);
      waiting.get(row.balanceMinor).push(row);
    }
  }
  return { transfers, remaining: balances.filter(row => !matched.has(row.memberId)) };
}

/**
 * Minimize transaction COUNT when every net debtor may pay any net creditor.
 * Remove exact opposite pairs, certify the heap plan against a lower bound,
 * then use exact subset DP on at most 20 residual members if still needed.
 * Larger unresolved cases return a valid plan with optimal:false.
 * preprocess:false and exactLimit:0 provide the plain heap baseline.
 * This function proposes transfers; it neither sends money nor records payments.
 */
export function optimizeSettlements(balances, {
  exactLimit = MAX_EXACT_MEMBERS, preprocess = true,
} = {}) {
  requireInteger(exactLimit, 'exactLimit');
  assert(exactLimit <= MAX_EXACT_MEMBERS, `exactLimit must be <= ${MAX_EXACT_MEMBERS}`);
  assert(typeof preprocess === 'boolean', 'preprocess must be boolean');
  const active = normalizeBalances(balances).filter(row => row.balanceMinor !== 0);
  const pairs = preprocess ? extractEqualPairs(active) : { transfers: [], remaining: active };
  const remaining = pairs.remaining;
  const debtors = remaining.filter(row => row.balanceMinor < 0).length;
  const creditors = remaining.length - debtors;
  let lowerBound = pairs.transfers.length + Math.max(debtors, creditors);
  let residualTransfers = greedyTransfers(remaining);
  let optimal = pairs.transfers.length + residualTransfers.length === lowerBound;
  let proof = optimal ? 'lower-bound' : 'not-certified';
  let method = remaining.length === 0 ? 'exact' : 'greedy';
  if (!optimal && remaining.length <= exactLimit) {
    residualTransfers = exactTransfers(remaining);
    optimal = true;
    proof = 'subset-dp';
    method = 'exact';
    lowerBound = pairs.transfers.length + residualTransfers.length;
  }
  const transfers = [...pairs.transfers, ...residualTransfers];
  transfers.sort((a, b) => compareIds(a.from, b.from) || compareIds(a.to, b.to));
  return {
    mode: 'min-transfers',
    transfers,
    transactionCount: transfers.length,
    optimal,
    optimalityScope: 'group',
    method,
    proof,
    lowerBound,
    pairedMembers: pairs.transfers.length * 2,
    remainingMembers: remaining.length,
    activeMembers: active.length,
  };
}

/**
 * Every transfer passes through the selected collector. Exactly one transfer
 * per nonzero non-collector is necessary and sufficient under this constraint.
 * Incoming transfers precede outgoing transfers. Funding beyond future receipts
 * can include funds already held after confirmed collections, not just own cash.
 */
export function collectSettlements(balances, { collectorId } = {}) {
  requireId(collectorId, 'collectorId');
  const normalized = normalizeBalances(balances);
  const collector = normalized.find(row => row.memberId === collectorId);
  assert(collector, `Unknown collector: ${collectorId}`);
  const incoming = [];
  const outgoing = [];
  let receive = 0n;
  let send = 0n;
  for (const { memberId, balanceMinor } of normalized) {
    if (memberId === collectorId || balanceMinor === 0) continue;
    if (balanceMinor < 0) {
      incoming.push({ from: memberId, to: collectorId, amountMinor: -balanceMinor });
      receive -= BigInt(balanceMinor);
    } else {
      outgoing.push({ from: collectorId, to: memberId, amountMinor: balanceMinor });
      send += BigInt(balanceMinor);
    }
  }
  const transfers = [...incoming, ...outgoing];
  return {
    mode: 'collector',
    collectorId,
    transfers,
    transactionCount: transfers.length,
    activeMembers: normalized.filter(row => row.balanceMinor !== 0).length,
    optimal: true,
    optimalityScope: 'selected-collector',
    method: 'star',
    proof: 'one-transfer-per-nonzero-peer',
    lowerBound: transfers.length,
    // Each separate total is <= total positive balance; their sum can exceed
    // Number.MAX_SAFE_INTEGER, so do not combine them into a Number total.
    collector: {
      balanceMinor: collector.balanceMinor,
      receiveMinor: toSafeMoney(receive, 'Collector receipts'),
      sendMinor: toSafeMoney(send, 'Collector payments'),
      fundingRequiredMinor: Math.max(0, -collector.balanceMinor),
      keepMinor: Math.max(0, collector.balanceMinor),
    },
    phases: [
      { phase: 'collect', transfers: incoming },
      { phase: 'distribute', transfers: outgoing },
    ],
  };
}

/** Shared entry point for a backend mode selector; input is a balance snapshot. */
export function suggestSettlements(balances, options = {}) {
  const { mode = 'min-transfers', collectorId, exactLimit, preprocess } = options;
  if (mode === 'min-transfers') {
    assert(collectorId === undefined, 'collectorId is only valid in collector mode');
    return optimizeSettlements(balances, { exactLimit, preprocess });
  }
  assert(mode === 'collector', 'mode must be min-transfers or collector');
  assert(exactLimit === undefined && preprocess === undefined,
    'exactLimit and preprocess are only valid in min-transfers mode');
  return collectSettlements(balances, { collectorId });
}
