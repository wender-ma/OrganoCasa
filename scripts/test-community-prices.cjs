const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const outDir = '/tmp/organocasa-test-community';
fs.mkdirSync(outDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/services/communityPrices.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(outDir, 'community.cjs')
});

esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/services/cnpjEnricher.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(outDir, 'cnpj.cjs')
});

const {
  normalizeCommunityKey,
  buildGoogleMapsStoreUrl,
  computeCommunityStats
} = require(path.join(outDir, 'community.cjs'));

const {
  extractCnpjDigits,
  formatCnpjDigits
} = require(path.join(outDir, 'cnpj.cjs'));

console.log('=== TESTES DE BANCO COMUNITÁRIO & LOCALIZAÇÃO ===\n');

// 1. Key normalization
assert.strictEqual(normalizeCommunityKey('Feijão Carioca 1Kg!'), 'feijao carioca 1kg');
assert.strictEqual(normalizeCommunityKey('  ARROZ   CRISTAL 5KG '), 'arroz cristal 5kg');
console.log('✓ Normalização de chave de produto validada');

// 2. Google Maps URL generation
const mapsUrl = buildGoogleMapsStoreUrl({
  storeName: 'Supermercado Tatico',
  storeAddress: 'Av. T-63, 1200',
  storeNeighborhood: 'Setor Bueno',
  storeCity: 'Goiânia',
  storeState: 'GO'
});
assert.ok(mapsUrl.startsWith('https://www.google.com/maps/search/?api=1&query='));
assert.ok(decodeURIComponent(mapsUrl).includes('Supermercado Tatico, Av. T-63, 1200, Setor Bueno, Goiânia, GO, Brasil'));
console.log('✓ Geração do link oficial do Google Maps validada');

// 3. CNPJ extraction from 44-digit NF-e access key
const sampleKey = '52261112345678000195650010000123451000123456';
assert.strictEqual(sampleKey.length, 44);
assert.strictEqual(extractCnpjDigits(sampleKey), '12345678000195');
assert.strictEqual(formatCnpjDigits('12345678000195'), '12.345.678/0001-95');
console.log('✓ Extração de CNPJ da chave SEFAZ de 44 dígitos validada');

// 4. Community median / min / max / best offer
const stats = computeCommunityStats([
  { id: '1', unitPrice: 28.9, storeName: 'Loja A', googleMapsUrl: 'https://maps.google.com/?q=1' },
  { id: '2', unitPrice: 21.5, storeName: 'Atacadão B', googleMapsUrl: 'https://maps.google.com/?q=2' },
  { id: '3', unitPrice: 24.9, storeName: 'Mercado C', googleMapsUrl: 'https://maps.google.com/?q=3' }
]);
assert.strictEqual(stats.sampleCount, 3);
assert.strictEqual(stats.minPrice, 21.5);
assert.strictEqual(stats.medianPrice, 24.9);
assert.strictEqual(stats.maxPrice, 28.9);
assert.strictEqual(stats.bestOffer.storeName, 'Atacadão B');
console.log('✓ Estatísticas comunitárias (mediana, menor, maior, melhor oferta) validadas');

console.log('\n=== TODOS OS TESTES DO BANCO COMUNITÁRIO PASSARAM! ===');
