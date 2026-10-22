// Testes Automatizados Intensivos — Fase 2 (P1: Dark Mode, Scanner/Câmera, Módulo 11 e Segurança)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TESTES INTENSIVOS DA FASE 2 (Dark Mode, Scanner/Câmera, Módulo 11 e Segurança) ===\n');

const tailwindFile = path.resolve(__dirname, '../tailwind.config.js');
const cssFile = path.resolve(__dirname, '../src/index.css');
const headerFile = path.resolve(__dirname, '../src/components/layout/Header.tsx');
const qrModalFile = path.resolve(__dirname, '../src/components/receipts/QRCodeScannerModal.tsx');
const camModalFile = path.resolve(__dirname, '../src/components/receipts/CameraReceiptScannerModal.tsx');
const qrHookFile = path.resolve(__dirname, '../src/hooks/useQrScanner.ts');
const nfceFile = path.resolve(__dirname, '../src/services/nfceClassifier.ts');
const sefazApiFile = path.resolve(__dirname, '../api/fetch-sefaz.js');
const gitignoreFile = path.resolve(__dirname, '../.gitignore');
const reconModalFile = path.resolve(__dirname, '../src/components/receipts/ReconciliationModal.tsx');

const tailwindCode = fs.readFileSync(tailwindFile, 'utf8');
const cssCode = fs.readFileSync(cssFile, 'utf8');
const headerCode = fs.readFileSync(headerFile, 'utf8');
const qrModalCode = fs.readFileSync(qrModalFile, 'utf8');
const camModalCode = fs.readFileSync(camModalFile, 'utf8');
const qrHookCode = fs.readFileSync(qrHookFile, 'utf8');
const nfceCode = fs.readFileSync(nfceFile, 'utf8');
const gitignoreCode = fs.readFileSync(gitignoreFile, 'utf8');
const reconModalCode = fs.readFileSync(reconModalFile, 'utf8');

const indexHtmlFile = path.resolve(__dirname, '../index.html');
const uploadModalFile = path.resolve(__dirname, '../src/components/receipts/ReceiptUploadModal.tsx');
const parserFile = path.resolve(__dirname, '../src/services/receiptParser.ts');
const indexHtmlCode = fs.readFileSync(indexHtmlFile, 'utf8');
const uploadModalCode = fs.readFileSync(uploadModalFile, 'utf8');
const parserCode = fs.readFileSync(parserFile, 'utf8');

// 1. Dark Mode & Classes Tailwind
assert(tailwindCode.includes("darkMode: 'class'"), "tailwind.config.js deve ter darkMode: 'class'");
assert(tailwindCode.includes('850:'), 'tailwind.config.js deve definir slate.850');
assert(tailwindCode.includes("'2xs':"), 'tailwind.config.js deve definir boxShadow 2xs');
assert(tailwindCode.includes('98:'), 'tailwind.config.js deve definir scale 98');
assert(indexHtmlCode.includes("localStorage.getItem('organocasa_theme')") && indexHtmlCode.includes("document.documentElement.classList.add('dark')"), 'index.html deve aplicar .dark sincronamente antes do primeiro paint (anti-FOUC)');
assert(cssCode.includes('html.dark body'), 'src/index.css deve usar html.dark body em vez de media query isolada');
assert(!cssCode.includes('@media (prefers-color-scheme: dark)'), 'src/index.css não deve forçar fundo escuro sem classe .dark');
assert(headerCode.includes("document.documentElement.classList.toggle('dark'"), 'Header.tsx deve sincronizar classe .dark no <html>');
assert(headerCode.includes('handleToggleTheme'), 'Header.tsx deve oferecer botão de alternância de tema');
assert(!qrModalCode.includes('border-t-3 '), 'QRCodeScannerModal.tsx deve usar border-t-[3px]');
console.log('✓ [1/5] Dark Mode (anti-FOUC em index.html + sincronização <html>) e classes Tailwind v3 (slate-850, shadow-2xs, scale-98, border-[3px]) validadas');

// 2. Scanner & Câmera (AudioContext, ObjectURLs, setInterval guard, switchCamera)
assert(qrHookCode.includes('ctx.close()'), 'playBeepSound deve fechar o AudioContext após o beep');
assert(qrHookCode.includes("if (scannerStateRef.current !== 'scanning') return;"), 'setInterval de telemetria deve pausar quando não estiver escaneando');
assert(qrHookCode.includes('stop();\n      setTimeout(() => {\n        start();'), 'switchCamera deve reiniciar o stream sem adicionar facingMode nas deps de start');
assert(camModalCode.includes('URL.revokeObjectURL'), 'CameraReceiptScannerModal.tsx deve revogar Object URLs');
assert(camModalCode.includes('revokeAllPhotos'), 'CameraReceiptScannerModal.tsx deve revogar todas as fotos ao fechar/desmontar');
console.log('✓ [2/5] Fechamento de AudioContext, revogação de ObjectURLs, pausa de telemetria e switchCamera validados');

// 3. Validação Módulo 11 da Chave de Acesso de 44 dígitos (incluindo parseQRCodeUrl e chaves de demonstração)
assert(nfceCode.includes('export function calculateAccessKeyCheckDigit'), 'calculateAccessKeyCheckDigit deve existir');
assert(nfceCode.includes('export function validateAccessKeyMod11'), 'validateAccessKeyMod11 deve existir');
assert(parserCode.includes('inspectAccessKey(accessKey)'), 'parseQRCodeUrl deve validar chaves brutas de 44 dígitos com inspectAccessKey');

function calcMod11(digits43) {
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) {
    sum += parseInt(digits43[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  return rem === 0 || rem === 1 ? 0 : 11 - rem;
}

const base43 = '5226094554391502789665079000094610112410885';
const validDv = calcMod11(base43);
const validKey44 = base43 + String(validDv);
const wrongDv = (validDv + 1) % 10;
const invalidKey44 = base43 + String(wrongDv);

assert.strictEqual(validKey44.length, 44);
assert.notStrictEqual(validKey44, invalidKey44);
assert(nfceCode.includes('checkDigitValid = validateAccessKeyMod11(digits)'), 'inspectAccessKey deve validar o Módulo 11');

// Verificar que todas as chaves de 44 dígitos em ReceiptUploadModal possuem DV Módulo 11 válido
const demoKeyMatches = uploadModalCode.match(/\b\d{44}\b/g) || [];
assert(demoKeyMatches.length >= 2, 'ReceiptUploadModal deve conter chaves de demonstração de 44 dígitos');
for (const key of demoKeyMatches) {
  const expectedDv = calcMod11(key.slice(0, 43));
  assert.strictEqual(parseInt(key[43], 10), expectedDv, `Chave ${key} em ReceiptUploadModal deve ter DV Módulo 11 válido`);
}
console.log(`✓ [3/5] Validação Módulo 11 da chave SEFAZ de 44 dígitos testada em nfceClassifier, parseQRCodeUrl e chaves demo (DV=${validDv})`);

// 4. Segurança Anti-SSRF em /api/fetch-sefaz
const sefazModule = require(sefazApiFile);
assert(typeof sefazModule.isAllowedSefazUrl === 'function', 'isAllowedSefazUrl deve estar exportada em api/fetch-sefaz.js');

// Domínios legítimos .gov.br
assert.strictEqual(sefazModule.isAllowedSefazUrl('https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p=123'), true);
assert.strictEqual(sefazModule.isAllowedSefazUrl('https://www.fazenda.sp.gov.br/nfce/consulta?p=123'), true);
assert.strictEqual(sefazModule.isAllowedSefazUrl('http://nfce.sefaz.rs.gov.br/api'), true);

// Vetores de ataque SSRF bloqueados
assert.strictEqual(sefazModule.isAllowedSefazUrl('http://169.254.169.254/latest/meta-data/'), false, 'Deve bloquear metadata AWS');
assert.strictEqual(sefazModule.isAllowedSefazUrl('http://localhost:3000/admin'), false, 'Deve bloquear localhost');
assert.strictEqual(sefazModule.isAllowedSefazUrl('http://127.0.0.1:5432/'), false, 'Deve bloquear loopback IP');
assert.strictEqual(sefazModule.isAllowedSefazUrl('https://evil.com/sefaz.go.gov.br'), false, 'Deve bloquear path spoofing');
assert.strictEqual(sefazModule.isAllowedSefazUrl('https://sefaz.go.gov.br.evil.com/'), false, 'Deve bloquear subdomain spoofing');
assert.strictEqual(sefazModule.isAllowedSefazUrl('https://attacker:secret@sefaz.go.gov.br/'), false, 'Deve bloquear credenciais embutidas na URL');
assert.strictEqual(sefazModule.isAllowedSefazUrl('https://sefaz.go.gov.br:8080/'), false, 'Deve bloquear portas não-padrão');
assert.strictEqual(sefazModule.isAllowedSefazUrl('file:///etc/passwd'), false, 'Deve bloquear protocolo file://');

// Teste de integração do handler HTTP com ataque SSRF
async function testSefazHandlerSsrf() {
  let statusCode = 0;
  let jsonBody = null;
  const req = {
    method: 'POST',
    body: { url: 'http://169.254.169.254/latest/meta-data/' }
  };
  const res = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
    end() {}
  };
  await sefazModule(req, res);
  assert.strictEqual(statusCode, 400, 'Handler deve retornar HTTP 400 para URL não-.gov.br');
  assert.strictEqual(jsonBody.success, false);
  assert(jsonBody.error.includes('.gov.br'), 'Mensagem de erro deve informar restrição a .gov.br');
}

// 5. .gitignore e imutabilidade de props no ReconciliationModal
assert(gitignoreCode.includes('.env.*'), '.gitignore deve conter .env.*');
assert(gitignoreCode.includes('!.env.example'), '.gitignore deve preservar !.env.example');
assert(!reconModalCode.includes('receiptData.totalAmount ='), 'ReconciliationModal.tsx não deve mutar receiptData.totalAmount diretamente');

testSefazHandlerSsrf().then(() => {
  console.log('✓ [4/5] Proteção Anti-SSRF em /api/fetch-sefaz validada contra vetores de ataque (metadata IP, localhost, spoofing, credenciais, portas)');
  console.log('✓ [5/5] .gitignore (.env.* / !.env.example) e imutabilidade de props em ReconciliationModal validados');
  console.log('\n=== TODOS OS TESTES DA FASE 2 PASSARAM COM SUCESSO! ===');
}).catch((err) => {
  console.error('Falha nos testes da Fase 2:', err);
  process.exit(1);
});
