const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const entry = path.resolve(__dirname, '../src/utils/monthlyReceiptAnalytics.ts');
const outDir = '/tmp/organocasa-test-analytics';
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'analytics.cjs');

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: outFile
});

const {
  parseReceiptDate,
  getMonthKey,
  shiftMonthKey,
  buildMonthlyReport,
  resolveDefaultComparisonMonths,
  buildTimelineSeries,
  compareTwoMonths
} = require(outFile);

console.log('=== TESTES DE COMPARATIVO MENSAL (monthlyReceiptAnalytics) ===\n');

// 1. Date-only parsing without UTC timezone drift
const novFirst = parseReceiptDate('2026-11-01');
assert.strictEqual(getMonthKey(novFirst), '2026-11', 'YYYY-MM-DD deve permanecer no mesmo mês local');
assert.strictEqual(shiftMonthKey('2026-01', -1), '2025-12', 'Virada de ano para trás deve ir para dez/2025');
assert.strictEqual(shiftMonthKey('2026-12', 1), '2027-01', 'Virada de ano para frente deve ir para jan/2027');
console.log('✓ Parse de data e virada de mês validados');

// 2. Multi-month aggregation, categories, stores, products
const sampleReceipts = [
  {
    id: 'r1',
    storeName: 'Supermercado Dia',
    totalAmount: 200,
    purchaseDate: '2026-11-05T14:00:00Z',
    rawType: 'qr_code',
    createdAt: '2026-11-05T14:00:00Z',
    items: [
      { name: 'Arroz Branco 5kg', quantity: 1, unitPrice: 30, totalPrice: 30, unit: 'pct' },
      { name: 'Picanha Bovina', quantity: 2, unitPrice: 65, totalPrice: 130, unit: 'kg', category: 'Carnes e Aves' },
      { name: 'Banana Prata', quantity: 4, unitPrice: 10, totalPrice: 40, unit: 'kg' }
    ]
  },
  {
    id: 'r2',
    storeName: 'Atacadão',
    totalAmount: 100,
    purchaseDate: '2026-11-18',
    rawType: 'ocr_image',
    createdAt: '2026-11-18T12:00:00Z',
    items: [
      { name: 'ARROZ BRANCO 5KG', quantity: 1, unitPrice: 28, totalPrice: 28, unit: 'pct' },
      { name: 'Detergente Ype', quantity: 6, unitPrice: 12, totalPrice: 72, unit: 'un' }
    ]
  },
  {
    id: 'r3',
    storeName: 'Supermercado Dia',
    totalAmount: 400,
    purchaseDate: '2026-10-12T10:00:00Z',
    rawType: 'qr_code',
    createdAt: '2026-10-12T10:00:00Z',
    items: [
      { name: 'Alcatra', quantity: 3, unitPrice: 50, totalPrice: 150, unit: 'kg' },
      { name: 'Leite Integral', quantity: 10, unitPrice: 5, totalPrice: 50, unit: 'l' },
      { name: 'Arroz Branco 5kg', quantity: 2, unitPrice: 32, totalPrice: 64, unit: 'pct' },
      { name: 'Compra Geral', quantity: 1, unitPrice: 136, totalPrice: 136, unit: 'un', category: 'Outros' }
    ]
  },
  {
    id: 'r4',
    storeName: 'Padaria Central',
    totalAmount: 50,
    purchaseDate: '2026-08-03T09:00:00Z',
    rawType: 'manual',
    createdAt: '2026-08-03T09:00:00Z',
    items: []
  },
  {
    id: 'r5-viagem',
    storeName: 'Atacadão da Praia',
    totalAmount: 1850,
    purchaseDate: '2026-11-20T16:00:00Z',
    rawType: 'qr_code',
    excludeFromStats: true,
    createdAt: '2026-11-20T16:00:00Z',
    items: [
      { name: 'Picanha Bovina', quantity: 10, unitPrice: 70, totalPrice: 700, unit: 'kg', category: 'Carnes e Aves' }
    ]
  }
];

const refDate = new Date(2026, 10, 22, 12, 0, 0); // 2026-11-22
const report = buildMonthlyReport(sampleReceipts, refDate);

assert.strictEqual(report.activeMonthsCount, 3);
assert.strictEqual(report.countedReceiptsCount, 4);
assert.strictEqual(report.excludedReceiptsCount, 1);
assert.strictEqual(report.excludedTotalSpent, 1850);
assert.strictEqual(report.overallTotalSpent, 750);
assert.strictEqual(report.overallAverageMonthly, 250);
assert.strictEqual(report.bucketMap['2026-11'].totalAmount, 300);
assert.strictEqual(report.bucketMap['2026-11'].receiptCount, 2);
assert.strictEqual(report.bucketMap['2026-11'].averageTicket, 150);
assert.strictEqual(report.bucketMap['2026-11'].itemCount, 5);
assert.strictEqual(report.bucketMap['2026-11'].byCategory['Carnes e Aves'], 130);
assert.strictEqual(report.bucketMap['2026-11'].byCategory['Hortifrúti'], 40);
assert.strictEqual(report.bucketMap['2026-11'].byCategory['Limpeza'], 72);
assert.strictEqual(report.bucketMap['2026-11'].byCategory['Mercearia'], 58);
assert.strictEqual(report.bucketMap['2026-08'].byCategory['Outros'], 50, 'Nota sem itens cai em Outros');
console.log('✓ Agregação mensal, categorias, lojas e ticket médio validados');

// 3. Comparison & defaults
const defaults = resolveDefaultComparisonMonths(report, refDate);
assert.strictEqual(defaults.monthA, '2026-11');
assert.strictEqual(defaults.monthB, '2026-10');

const comp = compareTwoMonths(report.bucketMap, '2026-11', '2026-10');
assert.strictEqual(comp.totalDiff, -100);
assert.strictEqual(comp.totalDiffPercent, -25);
assert.strictEqual(comp.countDiff, 1);

const arrozRow = comp.products.find((p) => p.key === 'arroz branco 5kg');
assert.ok(arrozRow, 'Produtos com variação de caixa devem ser agrupados');
assert.strictEqual(arrozRow.amountA, 58);
assert.strictEqual(arrozRow.amountB, 64);
assert.strictEqual(arrozRow.diff, -6);

const limpezaCat = comp.categories.find((c) => c.category === 'Limpeza');
assert.strictEqual(limpezaCat.diffPercent, null, 'Base zero deve retornar diffPercent null');
console.log('✓ Comparação direta (Mês A vs Mês B) e agrupamento de produtos validados');

// 4. Continuous timeline (filling Sep/2026 with zero)
const timeline6m = buildTimelineSeries(report.bucketMap, '6m', refDate);
assert.strictEqual(timeline6m.points.length, 6);
const sepPoint = timeline6m.points.find((p) => p.monthKey === '2026-09');
assert.ok(sepPoint);
assert.strictEqual(sepPoint.totalAmount, 0);
assert.strictEqual(sepPoint.hasData, false);
console.log('✓ Série temporal contínua (6M incluindo meses sem compras) validada');

console.log('\n=== TODOS OS TESTES DO COMPARATIVO MENSAL PASSARAM! ===');
