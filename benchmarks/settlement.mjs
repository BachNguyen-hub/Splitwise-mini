import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { calculateBalances, suggestSettlements } from '../src/settlement.mjs';
import { counterexample, createTwentyPersonLedger } from '../examples/fixtures.mjs';

let seed = 20260924;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const randomTwenty = Array.from({ length: 19 }, (_, i) => ({
  memberId: `R${String(i).padStart(2, '0')}`,
  balanceMinor: (random() % 2_000_000) - 1_000_000 || 1,
}));
randomTwenty.push({
  memberId: 'R19',
  balanceMinor: -randomTwenty.reduce((sum, row) => sum + row.balanceMinor, 0),
});
const cases = [
  ['6-person counterexample', counterexample],
  ['20-person shared purchases', calculateBalances(createTwentyPersonLedger())],
  ['20-person seeded random', randomTwenty],
  ['200-person opposite pairs', Array.from({ length: 200 }, (_, i) => ({
    memberId: `L${String(i).padStart(3, '0')}`,
    balanceMinor: (i % 2 ? -1 : 1) * (Math.floor(i / 2) + 1) * 1000,
  }))],
];
const results = [];
for (const [name, balances] of cases) {
  for (const [requestedMode, options] of [
    ['plain greedy', { mode: 'min-transfers', exactLimit: 0, preprocess: false }],
    ['min-transfers', { mode: 'min-transfers' }],
    ['collector', { mode: 'collector', collectorId: balances[0].memberId }],
  ]) {
    suggestSettlements(balances, options); // Warm-up, excluded from timing.
    const samples = [];
    let plan;
    for (let i = 0; i < 9; i++) {
      const start = performance.now();
      plan = suggestSettlements(balances, options);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    results.push({
      case: name, requestedMode,
      method: plan.method, optimal: plan.optimal, transfers: plan.transactionCount,
      optimalityScope: plan.optimalityScope,
      medianMs: Number(samples[4].toFixed(3)), maxMs: Number(samples.at(-1).toFixed(3)),
    });
  }
}
console.log(JSON.stringify({
  node: process.version, platform: process.platform, cpu: cpus()[0]?.model,
  samplesPerCase: 9, results,
}, null, 2));
