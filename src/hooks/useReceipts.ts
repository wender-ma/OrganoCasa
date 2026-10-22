import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import {
  Receipt,
  ReceiptItem,
  ShoppingList,
  ShoppingListItem,
  Product,
  PriceRecord,
  ReconciliationItem
} from '../types';
import { guessCategoryFromName } from '../services/receiptParser';
import {
  pushSingleItem,
  deleteSingleItem,
  pushSingleList,
  pushSingleProduct,
  pushSingleReceipt,
  deleteSingleReceipt,
  pushSinglePriceRecord,
  deleteMultiplePriceRecords,
  triggerFullSync,
  getCurrentSession
} from '../services/supabaseSync';

// Fuzzy similarity helper to match names (e.g. "ARROZ TIO JOAO 5KG" matches "Arroz Branco 5kg")
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

  if (s1.length === 0 || s2.length === 0) return 0;

  let matches = 0;
  for (const w1 of s1) {
    for (const w2 of s2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        matches++;
        break;
      }
    }
  }

  return matches / Math.max(s1.length, s2.length);
}

export function useReceipts() {
  const receipts = useLiveQuery(() => db.receipts.reverse().sortBy('createdAt')) || [];

  /**
   * Generates smart reconciliation items between a parsed receipt and current list items
   */
  async function generateReconciliation(
    receiptItems: ReceiptItem[],
    listItems: ShoppingListItem[]
  ): Promise<ReconciliationItem[]> {
    const products = await db.products.toArray();
    const reconciliationList: ReconciliationItem[] = [];
    const matchedListIds = new Set<string>();
    const matchedReceiptIndexes = new Set<number>();

    // 1. Find matches for each receipt item
    receiptItems.forEach((rItem, rIndex) => {
      let bestMatch: ShoppingListItem | null = null;
      let highestScore = 0;

      listItems.forEach((lItem) => {
        if (matchedListIds.has(lItem.id)) return;

        // Exact barcode match
        if (rItem.barcode && lItem.productId) {
          const prod = products.find((p) => p.id === lItem.productId);
          if (prod?.barcode && prod.barcode === rItem.barcode) {
            bestMatch = lItem;
            highestScore = 1.0;
            return;
          }
        }

        const score = calculateSimilarity(rItem.name, lItem.name);
        if (score > 0.35 && score > highestScore) {
          highestScore = score;
          bestMatch = lItem;
        }
      });

      if (bestMatch && highestScore >= 0.35) {
        matchedListIds.add((bestMatch as ShoppingListItem).id);
        matchedReceiptIndexes.add(rIndex);

        const matchedProduct = products.find((p) => p.id === (bestMatch as ShoppingListItem).productId);

        reconciliationList.push({
          id: `rec-match-${rIndex}`,
          status: 'matched',
          name: (bestMatch as ShoppingListItem).name,
          barcode: rItem.barcode || matchedProduct?.barcode,
          brand: (bestMatch as ShoppingListItem).brand || rItem.brand || matchedProduct?.brand,
          category: (bestMatch as ShoppingListItem).category,
          imageUrl: (bestMatch as ShoppingListItem).imageUrl || rItem.imageUrl || matchedProduct?.imageUrl,
          quantity: rItem.quantity,
          unit: rItem.unit || (bestMatch as ShoppingListItem).unit,
          unitPrice: rItem.unitPrice,
          totalPrice: rItem.totalPrice,
          lastPrice: (bestMatch as ShoppingListItem).lastPrice,
          averagePrice: (bestMatch as ShoppingListItem).averagePrice,
          listItemId: (bestMatch as ShoppingListItem).id,
          productId: (bestMatch as ShoppingListItem).productId || matchedProduct?.id
        });
      }
    });

    // 2. Unplanned / Extra items from receipt (not in list)
    receiptItems.forEach((rItem, rIndex) => {
      if (!matchedReceiptIndexes.has(rIndex)) {
        const existingProd =
          (rItem.barcode ? products.find((p) => p.barcode === rItem.barcode) : undefined) ||
          products.find((p) => calculateSimilarity(p.name, rItem.name) > 0.6);

        reconciliationList.push({
          id: `rec-extra-${rIndex}`,
          status: 'unplanned',
          name: rItem.name,
          barcode: rItem.barcode || existingProd?.barcode,
          brand: existingProd?.brand || rItem.brand,
          category: existingProd ? existingProd.category : (rItem.category || guessCategoryFromName(rItem.name)),
          imageUrl: existingProd?.imageUrl || rItem.imageUrl,
          quantity: rItem.quantity,
          unit: rItem.unit || existingProd?.unit || 'un',
          unitPrice: rItem.unitPrice,
          totalPrice: rItem.totalPrice,
          lastPrice: existingProd?.lastPrice,
          averagePrice: existingProd?.averagePrice,
          productId: existingProd?.id,
          selectedAction: 'add_to_catalog'
        });
      }
    });

    // 3. Unbought items from shopping list (in list, but not found on receipt)
    listItems.forEach((lItem) => {
      if (!matchedListIds.has(lItem.id) && !lItem.isChecked) {
        reconciliationList.push({
          id: `rec-unbought-${lItem.id}`,
          status: 'unbought',
          name: lItem.name,
          category: lItem.category,
          imageUrl: lItem.imageUrl,
          quantity: lItem.quantity,
          unit: lItem.unit,
          lastPrice: lItem.lastPrice,
          averagePrice: lItem.averagePrice,
          listItemId: lItem.id,
          productId: lItem.productId,
          selectedAction: 'keep_in_list'
        });
      }
    });

    return reconciliationList;
  }

  /**
   * Applies the finalized reconciliation actions to IndexedDB & syncs with Supabase
   */
  async function applyReconciliation(
    receiptData: {
      storeName: string;
      accessKey?: string;
      totalAmount: number;
      purchaseDate: string;
      rawType: 'qr_code' | 'xml' | 'ocr_image' | 'manual';
      items: ReceiptItem[];
    },
    reconciliationItems: ReconciliationItem[],
    preferredListId?: string
  ) {
    const receiptId = `receipt-${Date.now()}`;
    const purchaseDate = receiptData.purchaseDate || new Date().toISOString();

    // Resolve active shopping list (or create a unique default list if none exists)
    let targetListId = preferredListId;
    if (targetListId) {
      const exists = await db.shoppingLists.get(targetListId);
      if (!exists) targetListId = undefined;
    }
    if (!targetListId) {
      const allLists = await db.shoppingLists.toArray();
      const defaultOrFirst = allLists.find((l) => l.isDefault) || allLists[0];
      if (defaultOrFirst) {
        targetListId = defaultOrFirst.id;
      } else {
        const session = getCurrentSession();
        const houseSuffix = session?.householdId
          ? session.householdId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)
          : Math.random().toString(36).substring(2, 6);
        const now = new Date().toISOString();
        const newDefaultList: ShoppingList = {
          id: `list-${Date.now()}-${houseSuffix}`,
          title: 'Compras da Semana',
          isDefault: true,
          status: 'active',
          createdAt: now,
          updatedAt: now
        };
        await db.shoppingLists.add(newDefaultList);
        await pushSingleList(newDefaultList).catch(console.warn);
        targetListId = newDefaultList.id;
      }
    }

    // 1. Build consolidated receipt items from confirmed items
    const confirmedItems = reconciliationItems.filter(
      (it) => it.status === 'matched' || (it.status === 'unplanned' && it.selectedAction !== 'ignore')
    );

    const finalReceiptItems: ReceiptItem[] = confirmedItems.map((it, idx) => ({
      id: `rc-item-${idx}-${Date.now()}`,
      name: it.name,
      barcode: it.barcode,
      brand: it.brand,
      category: it.category,
      imageUrl: it.imageUrl,
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice || it.lastPrice || 0),
      totalPrice: Number(it.totalPrice || Number(it.unitPrice || 0) * Number(it.quantity || 1)),
      unit: it.unit || 'un'
    }));

    const calculatedTotal = finalReceiptItems.reduce((sum, it) => sum + it.totalPrice, 0);
    const finalTotalAmount = calculatedTotal > 0 ? Number(calculatedTotal.toFixed(2)) : receiptData.totalAmount;

    // 2. Save Receipt Record (with deduplication by accessKey)
    let targetReceiptId = receiptId;
    let isReimport = false;
    let existingCreatedAt: string | undefined;

    if (receiptData.accessKey) {
      const existingReceipt = await db.receipts
        .where('accessKey')
        .equals(receiptData.accessKey)
        .first();

      if (existingReceipt) {
        targetReceiptId = existingReceipt.id;
        isReimport = true;
        existingCreatedAt = existingReceipt.createdAt;

        // Remove previous price records tied to this receipt to avoid duplicate history on re-import
        const oldPriceRecords = await db.priceRecords.where('receiptId').equals(targetReceiptId).toArray();
        if (oldPriceRecords.length > 0) {
          const oldIds = oldPriceRecords.map((r) => r.id);
          await db.priceRecords.bulkDelete(oldIds);
          deleteMultiplePriceRecords(oldIds).catch(console.warn);
        }
      }
    }

    const receiptRecord: Receipt = {
      id: targetReceiptId,
      listId: targetListId,
      storeName: receiptData.storeName,
      accessKey: receiptData.accessKey,
      totalAmount: finalTotalAmount,
      purchaseDate,
      rawType: receiptData.rawType,
      items: finalReceiptItems.length > 0 ? finalReceiptItems : receiptData.items,
      createdAt: existingCreatedAt || new Date().toISOString()
    };

    await db.receipts.put(receiptRecord);
    await pushSingleReceipt(receiptRecord).catch(console.warn);

    // 3. Process each item in reconciliation
    for (const item of reconciliationItems) {
      // Matched item
      if (item.status === 'matched') {
        if (item.listItemId) {
          const updatedAt = new Date().toISOString();
          await db.shoppingListItems.update(item.listItemId, {
            name: item.name,
            isChecked: true,
            quantity: item.quantity,
            lastPrice: item.unitPrice || item.lastPrice,
            averagePrice: item.unitPrice || item.averagePrice,
            ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
            ...(item.brand ? { brand: item.brand } : {}),
            updatedAt
          });
          const updatedItem = await db.shoppingListItems.get(item.listItemId);
          if (updatedItem) {
            pushSingleItem(updatedItem).catch(console.warn);
          }
        }

        if (item.productId && (item.barcode || item.imageUrl || item.brand)) {
          const existingProd = await db.products.get(item.productId);
          if (existingProd) {
            const prodUpdates: Partial<Product> = {};
            if (item.barcode && !existingProd.barcode) prodUpdates.barcode = item.barcode;
            if (item.imageUrl && !existingProd.imageUrl) prodUpdates.imageUrl = item.imageUrl;
            if (item.brand && !existingProd.brand) prodUpdates.brand = item.brand;
            if (Object.keys(prodUpdates).length > 0) {
              prodUpdates.updatedAt = new Date().toISOString();
              await db.products.update(item.productId, prodUpdates);
            }
          }
        }

        // Record purchase price using targetReceiptId (prevents orphaned price records on re-import)
        if (item.productId && item.unitPrice) {
          await addOrUpdatePriceHistory(
            item.productId,
            item.unitPrice,
            item.quantity,
            item.unit,
            receiptData.storeName,
            targetReceiptId,
            purchaseDate
          );
        }
      }

      // Unplanned / Extra item added by user or found on receipt
      if (item.status === 'unplanned' && item.selectedAction !== 'ignore') {
        let prodId = item.productId;
        if (!prodId) {
          prodId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const now = new Date().toISOString();
          const newProduct: Product = {
            id: prodId,
            name: item.name,
            category: item.category,
            brand: item.brand,
            barcode: item.barcode,
            imageUrl: item.imageUrl,
            unit: (item.unit as any) || 'un',
            averagePrice: item.unitPrice || 0,
            lastPrice: item.unitPrice || 0,
            lastPriceDate: purchaseDate,
            lastStore: receiptData.storeName,
            purchaseCount: item.unitPrice ? 1 : 0,
            createdAt: now,
            updatedAt: now
          };
          await db.products.add(newProduct);
          await pushSingleProduct(newProduct).catch(console.warn);
        } else if (item.barcode || item.imageUrl || item.brand) {
          const existingProd = await db.products.get(prodId);
          if (existingProd) {
            const prodUpdates: Partial<Product> = {};
            if (item.barcode && !existingProd.barcode) prodUpdates.barcode = item.barcode;
            if (item.imageUrl && !existingProd.imageUrl) prodUpdates.imageUrl = item.imageUrl;
            if (item.brand && !existingProd.brand) prodUpdates.brand = item.brand;
            if (Object.keys(prodUpdates).length > 0) {
              prodUpdates.updatedAt = new Date().toISOString();
              await db.products.update(prodId, prodUpdates);
              const updatedProd = await db.products.get(prodId);
              if (updatedProd) await pushSingleProduct(updatedProd).catch(console.warn);
            }
          }
        }

        // Avoid duplicating checked shopping list items when re-importing the same receipt
        let existingExtraItem: ShoppingListItem | undefined;
        if (isReimport && prodId) {
          const listItems = await db.shoppingListItems.where('listId').equals(targetListId).toArray();
          existingExtraItem = listItems.find((li) => li.productId === prodId && li.isChecked);
        }

        const now = new Date().toISOString();
        if (existingExtraItem) {
          const updatedExtra: ShoppingListItem = {
            ...existingExtraItem,
            name: item.name,
            category: item.category,
            brand: item.brand || existingExtraItem.brand,
            imageUrl: item.imageUrl || existingExtraItem.imageUrl,
            quantity: Number(item.quantity) || 1,
            unit: (item.unit as any) || 'un',
            averagePrice: item.unitPrice || existingExtraItem.averagePrice || 0,
            lastPrice: item.unitPrice || existingExtraItem.lastPrice || 0,
            isChecked: true,
            updatedAt: now
          };
          await db.shoppingListItems.put(updatedExtra);
          pushSingleItem(updatedExtra).catch(console.warn);
        } else {
          const extraItem: ShoppingListItem = {
            id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            listId: targetListId,
            productId: prodId,
            name: item.name,
            category: item.category,
            brand: item.brand,
            imageUrl: item.imageUrl,
            quantity: Number(item.quantity) || 1,
            unit: (item.unit as any) || 'un',
            averagePrice: item.unitPrice || 0,
            lastPrice: item.unitPrice || 0,
            isChecked: true,
            createdAt: now,
            updatedAt: now
          };
          await db.shoppingListItems.add(extraItem);
          pushSingleItem(extraItem).catch(console.warn);
        }

        if (item.unitPrice) {
          await addOrUpdatePriceHistory(
            prodId,
            item.unitPrice,
            item.quantity,
            item.unit,
            receiptData.storeName,
            targetReceiptId,
            purchaseDate
          );
        }
      }

      // Unbought item
      if (item.status === 'unbought') {
        if (item.selectedAction === 'remove_from_list' && item.listItemId) {
          await db.shoppingListItems.delete(item.listItemId);
          deleteSingleItem(item.listItemId).catch(console.warn);
        }
      }
    }

    // Background full sync to guarantee consistency
    triggerFullSync().catch(console.warn);
  }

  async function addOrUpdatePriceHistory(
    productId: string,
    unitPrice: number,
    quantity: number,
    unit: string,
    storeName: string,
    receiptId: string,
    date: string
  ) {
    // 1. Add Price Record
    const newPriceRecord: PriceRecord = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId,
      receiptId,
      price: unitPrice,
      quantity,
      unit,
      storeName,
      date
    };
    await db.priceRecords.add(newPriceRecord);
    pushSinglePriceRecord(newPriceRecord).catch(console.warn);

    // 2. Recalculate average price
    const allRecords = await db.priceRecords.where('productId').equals(productId).toArray();
    let totalSpent = 0;
    let totalQty = 0;
    allRecords.forEach((r) => {
      totalSpent += r.price * r.quantity;
      totalQty += r.quantity;
    });

    const newAvg = totalQty > 0 ? totalSpent / totalQty : unitPrice;

    // 3. Update Product
    const updatedAt = new Date().toISOString();
    await db.products.update(productId, {
      lastPrice: unitPrice,
      lastPriceDate: date,
      lastStore: storeName,
      averagePrice: Number(newAvg.toFixed(2)),
      purchaseCount: allRecords.length,
      updatedAt
    });
    const updatedProd = await db.products.get(productId);
    if (updatedProd) {
      pushSingleProduct(updatedProd).catch(console.warn);
    }
  }

  async function deleteReceipt(id: string) {
    const relatedRecords = await db.priceRecords.where('receiptId').equals(id).toArray();
    const affectedProductIds = Array.from(new Set(relatedRecords.map((r) => r.productId)));

    await db.receipts.delete(id);
    deleteSingleReceipt(id).catch(console.warn);

    if (relatedRecords.length > 0) {
      const relatedIds = relatedRecords.map((r) => r.id);
      await db.priceRecords.bulkDelete(relatedIds);
      deleteMultiplePriceRecords(relatedIds).catch(console.warn);
    }

    // Recalculate product statistics for every affected product
    for (const productId of affectedProductIds) {
      const remaining = await db.priceRecords.where('productId').equals(productId).toArray();
      const updatedAt = new Date().toISOString();

      if (remaining.length > 0) {
        let totalSpent = 0;
        let totalQty = 0;
        remaining.forEach((r) => {
          totalSpent += r.price * r.quantity;
          totalQty += r.quantity;
        });
        const newAvg = totalQty > 0 ? totalSpent / totalQty : remaining[0].price;
        const sortedByDate = [...remaining].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const latest = sortedByDate[0];

        await db.products.update(productId, {
          averagePrice: Number(newAvg.toFixed(2)),
          lastPrice: latest.price,
          lastPriceDate: latest.date,
          lastStore: latest.storeName,
          purchaseCount: remaining.length,
          updatedAt
        });
      } else {
        await db.products.update(productId, {
          averagePrice: 0,
          lastPrice: 0,
          lastPriceDate: undefined,
          lastStore: undefined,
          purchaseCount: 0,
          updatedAt
        });
      }

      const updatedProd = await db.products.get(productId);
      if (updatedProd) {
        pushSingleProduct(updatedProd).catch(console.warn);
      }
    }
  }

  return {
    receipts,
    generateReconciliation,
    applyReconciliation,
    deleteReceipt
  };
}
