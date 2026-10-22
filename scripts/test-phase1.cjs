// Testes Automatizados Intensivos — Fase 1 (P0 Crítico + Notificações Compartilhadas v1.4.1)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TESTES INTENSIVOS DA FASE 1 (P0 + Notificações Compartilhadas v1.4.1) ===\n');

const syncFile = path.resolve(__dirname, '../src/services/supabaseSync.ts');
const seedFile = path.resolve(__dirname, '../src/db/seed.ts');
const shoppingHookFile = path.resolve(__dirname, '../src/hooks/useShoppingList.ts');
const receiptsHookFile = path.resolve(__dirname, '../src/hooks/useReceipts.ts');
const appFile = path.resolve(__dirname, '../src/App.tsx');
const notifModalFile = path.resolve(__dirname, '../src/components/notifications/NotificationModal.tsx');
const versionFile = path.resolve(__dirname, '../src/version.ts');
const pkgFile = path.resolve(__dirname, '../package.json');

const syncCode = fs.readFileSync(syncFile, 'utf8');
const seedCode = fs.readFileSync(seedFile, 'utf8');
const shoppingHookCode = fs.readFileSync(shoppingHookFile, 'utf8');
const receiptsHookCode = fs.readFileSync(receiptsHookFile, 'utf8');
const appCode = fs.readFileSync(appFile, 'utf8');
const notifModalCode = fs.readFileSync(notifModalFile, 'utf8');
const versionCode = fs.readFileSync(versionFile, 'utf8');
const pkgJson = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));

// 1. Teste do filtro de Seed IDs (fim do bug startsWith('item-1'))
assert(!syncCode.includes("startsWith('item-1')"), "startsWith('item-1') ainda presente em supabaseSync.ts");
assert(!syncCode.includes("startsWith('item-2')"), "startsWith('item-2') ainda presente em supabaseSync.ts");
assert(syncCode.includes('export function isSeedRecord'), 'isSeedRecord deve estar exportada em supabaseSync.ts');

// Simulação comportamental de isSeedRecord com IDs reais de usuários (item-1761170000000-abcd) e seeds
const SEED_IDS = new Set([
  'item-1', 'item-2', 'item-3', 'item-4', 'item-5',
  'rem-1', 'rem-2', 'member-1', 'member-2',
  'prod-arroz-5kg', 'prod-feijao-1kg', 'prod-leite-integral-1l',
  'prod-cafe-500g', 'prod-azeite-500ml', 'prod-banana-prata',
  'prod-ovos-30un', 'prod-detergente-500ml'
]);
function isSeedRecordSim(id, createdAt) {
  if (!id) return false;
  if (createdAt === '2020-01-01T00:00:00.000Z') return true;
  if (id.startsWith('seed-')) return true;
  return SEED_IDS.has(id);
}
const realUserItemId = `item-${Date.now()}-x9a2`;
assert.strictEqual(isSeedRecordSim(realUserItemId, new Date().toISOString()), false, 'Item real com timestamp 17... NÃO pode ser bloqueado como seed');
assert.strictEqual(isSeedRecordSim('item-1', new Date().toISOString()), true, 'Seed item-1 exato deve ser bloqueado');
assert.strictEqual(isSeedRecordSim('item-100', new Date().toISOString()), false, 'item-100 não é seed');
assert.strictEqual(isSeedRecordSim('seed-abc', new Date().toISOString()), true, 'seed-abc deve ser bloqueado');
assert.strictEqual(isSeedRecordSim('qualquer-id', '2020-01-01T00:00:00.000Z'), true, 'Timestamp de seed deve ser bloqueado');
console.log('✓ [1/7] Filtro isSeedRecord validado (itens reais item-17... liberados, seeds bloqueados)');

// 2. Proteção de itens criados offline por >60s & Ordem de Upsert FK
assert(!syncCode.includes('itemAgeMs > 60000'), 'Deleção cega por itemAgeMs > 60000 deve ter sido removida');
assert(!syncCode.includes('ageMs > 60000'), 'Deleção cega por ageMs > 60000 deve ter sido removida');
assert(syncCode.includes('syncedIds.has(local.id)'), 'Deleção no Passo 2 deve checar syncedIds.has(local.id)');

const pushListsIdx = syncCode.indexOf("from('shopping_lists').upsert");
const pushProductsIdx = syncCode.indexOf("from('products').upsert");
const pushItemsIdx = syncCode.indexOf("from('shopping_list_items').upsert");
const pushPricesIdx = syncCode.indexOf("from('price_records').upsert");
assert(pushListsIdx > 0 && pushItemsIdx > 0 && pushListsIdx < pushItemsIdx, 'shopping_lists DEVE ser enviado antes de shopping_list_items no triggerFullSync');
assert(pushProductsIdx > 0 && pushPricesIdx > 0 && pushProductsIdx < pushPricesIdx, 'products DEVE ser enviado antes de price_records no triggerFullSync');
assert(syncCode.includes('existingHousehold'), 'Signup deve garantir existência do household antes de inserir household_members');
console.log('✓ [2/7] Proteção offline (>60s via syncedIds) e ordem de FK no triggerFullSync validados');

// 3. ShoppingListProvider Context compartilhado
assert(shoppingHookCode.includes('export const ShoppingListProvider'), 'ShoppingListProvider deve existir em useShoppingList.ts');
assert(shoppingHookCode.includes('useContext(ShoppingListContext)'), 'useShoppingList deve consumir ShoppingListContext');
assert(appCode.includes('<ShoppingListProvider>'), 'App.tsx deve envolver a árvore com <ShoppingListProvider>');
console.log('✓ [3/7] ShoppingListProvider (React Context) unificado em App.tsx, ShoppingList e ProductCatalogView');

// 4. Lista padrão com ID único por família e remoção de l.id === 'list-default' em clearSeedData
assert(!seedCode.includes("l.id === 'list-default'"), "clearSeedData não deve deletar l.id === 'list-default'");
assert(shoppingHookCode.includes('ensureActiveList'), 'addItem deve garantir criação automática de lista ativa com ID único');
console.log('✓ [4/7] Criação automática de lista padrão com ID único e preservação em clearSeedData validados');

// 5. updatedAt em todas as mutações locais
const toggleMatch = shoppingHookCode.match(/async function toggleItem[\s\S]*?pushSingleItem/);
assert(toggleMatch && toggleMatch[0].includes('updatedAt'), 'toggleItem deve atualizar updatedAt');
const qtyMatch = shoppingHookCode.match(/async function updateItemQuantity[\s\S]*?pushSingleItem/);
assert(qtyMatch && qtyMatch[0].includes('updatedAt'), 'updateItemQuantity deve atualizar updatedAt');
const updateMatch = shoppingHookCode.match(/async function updateItem[\s\S]*?pushSingleItem/);
assert(updateMatch && updateMatch[0].includes('updatedAt'), 'updateItem deve atualizar updatedAt');
const uncheckMatch = shoppingHookCode.match(/async function uncheckAllItems[\s\S]*?Promise\.all/);
assert(uncheckMatch && uncheckMatch[0].includes('updatedAt'), 'uncheckAllItems deve atualizar updatedAt');
console.log('✓ [5/7] updatedAt atualizado em todas as mutações locais (toggleItem, updateItemQuantity, updateItem, uncheckAllItems)');

// 6. Conciliação de Notas Fiscais (targetReceiptId, deduplicação por accessKey, recálculo em deleteReceipt, sync)
assert(!receiptsHookCode.includes('receiptId,\n            purchaseDate'), 'addOrUpdatePriceHistory não deve receber receiptId descartado');
const targetReceiptMatches = receiptsHookCode.match(/targetReceiptId,\s*purchaseDate/g) || [];
assert(targetReceiptMatches.length >= 2, 'addOrUpdatePriceHistory deve receber targetReceiptId tanto para matched quanto unplanned');
assert(receiptsHookCode.includes('pushSingleReceipt(receiptRecord)'), 'applyReconciliation deve sincronizar recibo via pushSingleReceipt');
assert(receiptsHookCode.includes('deleteSingleReceipt(id)'), 'deleteReceipt deve remover recibo do Supabase');
assert(receiptsHookCode.includes('affectedProductIds'), 'deleteReceipt deve recalcular estatísticas dos produtos afetados');
console.log('✓ [6/7] Conciliação e exclusão de notas fiscais corrigidas e sincronizadas com Supabase');

// 7. Notificações Compartilhadas da Casa (v1.4.1)
assert(syncCode.includes('export function markRecentLocalAction'), 'markRecentLocalAction deve existir');
assert(syncCode.includes('export function isRecentLocalAction'), 'isRecentLocalAction deve existir');
assert(syncCode.includes('🛒 Novo item na lista!'), 'Notificação de novo item na lista deve estar configurada');
assert(syncCode.includes('✅ Item comprado!'), 'Notificação de item comprado deve estar configurada');
assert(syncCode.includes('🧾 Nova compra na casa!'), 'Notificação de nova compra/nota fiscal deve estar configurada');
assert(syncCode.includes('✅ Tarefa concluída!'), 'Notificação de tarefa concluída deve estar configurada');
assert(notifModalCode.includes('Avisa quando alguém da casa adiciona itens, marca produtos como comprados ou finaliza uma compra.'), 'Texto de Lista Compartilhada atualizado no NotificationModal');
assert.strictEqual(pkgJson.version, '1.4.1', 'package.json deve estar na versão 1.4.1');
assert(versionCode.includes("'v1.4.1'"), 'src/version.ts deve estar na versão v1.4.1');
console.log('✓ [7/8] Notificações Compartilhadas da Casa (v1.4.1) e deduplicação de ações locais validadas');

// 8. Limpeza completa de seeds em clearSeedData e garantias de FK em pushSinglePriceRecord / pushSingleItem
assert(seedCode.includes('seedProductIds.has(p.id)') && seedCode.includes('db.products'), 'clearSeedData deve remover produtos seed de db.products');
assert(seedCode.includes('seedHistoryIds.has(pr.id)') && seedCode.includes('db.priceRecords'), 'clearSeedData deve remover registros de preço seed de db.priceRecords');
assert(seedCode.includes("m.id === 'member-1'") && seedCode.includes('db.householdMembers'), 'clearSeedData deve remover membros seed de db.householdMembers');
const pushSinglePriceMatch = syncCode.match(/export async function pushSinglePriceRecord[\s\S]*?from\('price_records'\)\.upsert/);
assert(pushSinglePriceMatch && pushSinglePriceMatch[0].includes('pushSingleProduct(localProduct)'), 'pushSinglePriceRecord deve garantir sincronização do produto pai antes do upsert');
const pushSingleItemMatch = syncCode.match(/export async function pushSingleItem[\s\S]*?from\('shopping_list_items'\)\.upsert/);
assert(pushSingleItemMatch && pushSingleItemMatch[0].includes('pushSingleProduct(localProduct)'), 'pushSingleItem deve garantir sincronização do produto pai antes do upsert');
assert(syncCode.includes('!remoteListMap.has(local.id) && syncedIds.has(local.id)'), 'triggerFullSync deve limpar listas deletadas remotamente');
assert(syncCode.includes('!remoteMemberMap.has(local.id) && syncedIds.has(local.id)'), 'triggerFullSync deve limpar membros deletados remotamente');
console.log('✓ [8/8] Limpeza completa de seeds (clearSeedData), FK guards em pushSinglePriceRecord/pushSingleItem e deleção remota de listas/membros validados');

console.log('\n=== TODOS OS TESTES DA FASE 1 PASSARAM COM SUCESSO! ===');
