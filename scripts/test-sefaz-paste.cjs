const assert = require('assert');

// Simulate the logic in parseReceiptTextHeuristics
function testParseSefazDanfeRow() {
  const line1 = 'SODA ANTARC LT (Código: 261688 ) Qtde.: 2 UN: un Vl. Unit.:   3,39 Vl. Total 6,78';
  const sefazPattern = /^(.+?)(?:\s*\([Cc][óo]digo:[^)]*\))?\s+Qtde\.?:\s*([0-9\.,]+)\s+UN:\s*([a-zA-Z]+)\s+Vl\.\s*Unit\.?:\s*(?:&nbsp;)?\s*([0-9\.,]+)\s+Vl\.\s*Total\s*([0-9\.,]+)/i;
  
  const m1 = line1.match(sefazPattern);
  assert(m1, 'Line 1 should match SEFAZ pattern');
  assert.strictEqual(m1[1].trim(), 'SODA ANTARC LT');
  assert.strictEqual(m1[2], '2');
  assert.strictEqual(m1[3], 'un');
  assert.strictEqual(m1[4], '3,39');
  assert.strictEqual(m1[5], '6,78');
  console.log('✓ SEFAZ Danfe format regex verified successfully');
}

function testParseTabTable() {
  const line = '1\tARROZ TIO JOAO 5KG\t2\tUN\t29,90\t59,80';
  const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
  assert.strictEqual(parts.length, 6);
  let name = parts[0];
  let rest = parts.slice(1);
  if (/^\d+$/.test(name) && rest.length >= 4) {
    name = rest[0];
    rest = rest.slice(1);
  }
  assert.strictEqual(name, 'ARROZ TIO JOAO 5KG');
  console.log('✓ Tab-delimited format verified successfully');
}

testParseSefazDanfeRow();
testParseTabTable();
console.log('All SEFAZ paste parsing tests passed!');
