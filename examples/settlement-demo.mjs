import { calculateBalances, optimizeSettlements, splitEqual, suggestSettlements } from '../src/settlement.mjs';
import { counterexample, createTwentyPersonLedger, createSubsetLedger } from './fixtures.mjs';

const money = amount => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(amount);

console.log('Chia 100.000 đồng cho ba người:');
console.table(splitEqual(100_000, ['An', 'Binh', 'Chi']));

const greedy = optimizeSettlements(counterexample, { exactLimit: 0, preprocess: false });
const exact = optimizeSettlements(counterexample);
console.log(`Ví dụ 6 người: greedy ${greedy.transactionCount} lượt; chính xác ${exact.transactionCount} lượt.`);
for (const t of exact.transfers) console.log(`${t.from} -> ${t.to}: ${money(t.amountMinor)}`);

const ledger = createTwentyPersonLedger();
const balances = calculateBalances(ledger);
const plan = optimizeSettlements(balances);
console.log('\nNhóm 20 người, tổng chi 10.000.000 đồng, mỗi người chịu 500.000 đồng:');
console.table(balances);
console.log(`Cần ${plan.transactionCount} lượt chuyển; đã chứng minh tối ưu: ${plan.optimal}.`);
for (const t of plan.transfers) console.log(`${t.from} -> ${t.to}: ${money(t.amountMinor)}`);

const confirmed = plan.transfers.map((transfer, i) => ({
  id: `repayment-${i}`, ...transfer, status: 'confirmed',
}));
const settled = calculateBalances({ ...ledger, settlements: confirmed });
console.log(`Sau khi tất cả khoản được xác nhận, mọi số dư bằng 0: ${settled.every(b => b.balanceMinor === 0)}.`);

const subsetLedger = createSubsetLedger();
const subsetBalances = calculateBalances(subsetLedger);
console.log('\nNhóm 5 người: A trả bữa ăn 300.000đ cho A/B/C; D trả taxi 200.000đ cho B/D. E không tham gia hai khoản.');
console.table(subsetBalances);
for (const options of [
  { mode: 'min-transfers' },
  { mode: 'collector', collectorId: 'A' },
  { mode: 'collector', collectorId: 'B' },
  { mode: 'collector', collectorId: 'E' },
]) {
  const suggestion = suggestSettlements(subsetBalances, options);
  console.log(`${options.mode}${options.collectorId ? ` qua ${options.collectorId}` : ''}: ${suggestion.transactionCount} lượt.`);
  for (const t of suggestion.transfers) console.log(`${t.from} -> ${t.to}: ${money(t.amountMinor)}`);
  if (suggestion.collector) {
    const c = suggestion.collector;
    console.log(`Nhận ${money(c.receiveMinor)}, chuyển ${money(c.sendMinor)}, giữ lại ${money(c.keepMinor)}; phần chi vượt thu trong phương án: ${money(c.fundingRequiredMinor)}.`);
  }
  const completed = calculateBalances({ ...subsetLedger, settlements: suggestion.transfers.map((t, i) => ({
    id: `subset-${i}`, ...t, status: 'confirmed',
  })) });
  if (!completed.every(row => row.balanceMinor === 0)) throw new Error('Subset plan did not settle');
}
