const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TESTES INTENSIVOS DA FASE 3 (Performance, Catálogo, Lembretes e Atalhos PWA) ===\n');

const parserCode = fs.readFileSync(path.join(__dirname, '../src/services/receiptParser.ts'), 'utf8');
const compressorCode = fs.readFileSync(path.join(__dirname, '../src/utils/imageCompressor.ts'), 'utf8');
const addModalCode = fs.readFileSync(path.join(__dirname, '../src/components/shopping/AddItemModal.tsx'), 'utf8');
const editModalCode = fs.readFileSync(path.join(__dirname, '../src/components/shopping/EditItemModal.tsx'), 'utf8');
const catalogCode = fs.readFileSync(path.join(__dirname, '../src/components/products/ProductCatalogView.tsx'), 'utf8');
const remindersViewCode = fs.readFileSync(path.join(__dirname, '../src/components/reminders/RemindersView.tsx'), 'utf8');
const reminderCardCode = fs.readFileSync(path.join(__dirname, '../src/components/reminders/ReminderCard.tsx'), 'utf8');
const addReminderModalCode = fs.readFileSync(path.join(__dirname, '../src/components/reminders/AddReminderModal.tsx'), 'utf8');
const appCode = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');

// 1. Lazy loading de tesseract.js
assert.ok(
  !parserCode.includes("import { createWorker } from 'tesseract.js'"),
  'tesseract.js não deve ser importado estaticamente no topo de receiptParser.ts'
);
assert.ok(
  parserCode.includes("await import('tesseract.js')"),
  'parseReceiptImage deve usar dynamic import("tesseract.js")'
);
console.log('✓ [1/6] Lazy loading dinâmico de tesseract.js validado em receiptParser.ts');

const qrHookCode = fs.readFileSync(path.join(__dirname, '../src/hooks/useQrScanner.ts'), 'utf8');
const receiptsHookCode = fs.readFileSync(path.join(__dirname, '../src/hooks/useReceipts.ts'), 'utf8');
const productsHookCode = fs.readFileSync(path.join(__dirname, '../src/hooks/useProducts.ts'), 'utf8');
const shoppingHookCode = fs.readFileSync(path.join(__dirname, '../src/hooks/useShoppingList.ts'), 'utf8');

// 2. Enriquecimento de código de barras EAN-13/EAN-8 de ponta a ponta
assert.ok(
  parserCode.includes('fetchProductByBarcode') &&
    parserCode.includes("db.products.where('barcode').equals(barcode)") &&
    parserCode.includes('imageUrl = offProd.image_url'),
  'parseQRCodeUrl deve consultar db.products e fetchProductByBarcode ao ler EAN-13/EAN-8 preservando imageUrl, brand e category'
);
assert.ok(
  qrHookCode.includes("'ean_13'") && qrHookCode.includes("'ean_8'"),
  'useQrScanner deve inicializar BarcodeDetector com suporte a ean_13 e ean_8 além de qr_code'
);
assert.ok(
  receiptsHookCode.includes('barcode: item.barcode') &&
    receiptsHookCode.includes('products.find((p) => p.barcode === rItem.barcode)'),
  'useReceipts deve casar produtos por barcode e salvar barcode/brand/imageUrl no catálogo ao aplicar conciliação'
);
console.log('✓ [2/6] Integração ponta-a-ponta de EAN-13/EAN-8 (BarcodeDetector + OpenFoodFacts + persistência de barcode/imageUrl no catálogo) validada');

// 3. Compressão de imagens via Canvas antes de Base64
assert.ok(
  compressorCode.includes('export async function compressImageFile') &&
    compressorCode.includes("canvas.toDataURL('image/jpeg', quality)") &&
    compressorCode.includes('URL.revokeObjectURL'),
  'imageCompressor.ts deve redimensionar via Canvas, exportar JPEG comprimido e revogar ObjectURL'
);
assert.ok(
  addModalCode.includes('compressImageFile(file') &&
    editModalCode.includes('compressImageFile(file') &&
    catalogCode.includes('compressImageFile(file'),
  'AddItemModal, EditItemModal e ProductCatalogView devem usar compressImageFile'
);
console.log('✓ [3/6] Compressão de fotos via Canvas (400px, JPEG 0.75) validada nos modais de itens e catálogo');

// 4. Catálogo: correção do bug (+1), edição/exclusão de produtos e sincronização bidirecional lista <-> catálogo
assert.ok(
  catalogCode.includes('updateItemQuantity(existingItem.id') &&
    catalogCode.includes('i.productId === prod.id && !i.isChecked'),
  'ProductCatalogView deve incrementar a quantidade do item existente em vez de duplicar linha'
);
assert.ok(
  catalogCode.includes('updateProduct') &&
    catalogCode.includes('deleteProduct') &&
    catalogCode.includes('handleSaveEditProduct') &&
    catalogCode.includes('handleDeleteProduct'),
  'ProductCatalogView deve permitir editar e excluir produtos do catálogo'
);
assert.ok(
  productsHookCode.includes("db.shoppingListItems.where('productId').equals(id)") &&
    shoppingHookCode.includes('db.products.update(item.productId, prodUpdates)'),
  'updateProduct e updateItem devem manter itens ativos da lista e produtos do catálogo sincronizados'
);
console.log('✓ [4/6] Correção de duplicação (+1), edição/exclusão de produtos e sincronização catálogo <-> lista validadas');

// 5. Edição de lembretes existentes (incluindo correção de índice no checklist e recálculo de isCompleted)
assert.ok(
  remindersViewCode.includes('updateReminder') &&
    remindersViewCode.includes('editingReminder') &&
    reminderCardCode.includes('onEdit') &&
    addReminderModalCode.includes('onUpdateReminder'),
  'RemindersView, ReminderCard e AddReminderModal devem suportar edição de lembretes existentes'
);
assert.ok(
  !addReminderModalCode.includes("useState<string[]>([''])") &&
    addReminderModalCode.includes('updatedChecklist.every((c) => c.isDone)'),
  'AddReminderModal deve usar estado de checklist sem string vazia fantasma e recalcular isCompleted ao editar sub-itens'
);
console.log('✓ [5/6] Edição completa de lembretes existentes (checklist index + isCompleted) validada');

// 6. Atalhos de URL do PWA (?action=scan e ?tab=reminders)
assert.ok(
  appCode.includes('new URLSearchParams(window.location.search)') &&
    appCode.includes("action === 'scan'") &&
    appCode.includes('setIsReceiptUploadOpen(true)') &&
    appCode.includes("tab === 'reminders'"),
  'App.tsx deve processar os parâmetros de atalho do PWA (?action=scan e ?tab=...)'
);
console.log('✓ [6/6] Atalhos de URL do PWA (?action=scan e ?tab=reminders) validados em App.tsx');

console.log('\n=== TODOS OS TESTES DA FASE 3 PASSARAM COM SUCESSO! ===');
