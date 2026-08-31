import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import {
  Receipt,
  ReceiptItem,
  ShoppingListItem,
  Product,
  ReconciliationItem,
  ReconciliationStatus
} from '../types';
import { guessCategoryFromName } from '../services/receiptParser';

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
          category: (bestMatch as ShoppingListItem).category,
          imageUrl: (bestMatch as ShoppingListItem).imageUrl,
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
        const existingProd = products.find((p) => calculateSimilarity(p.name, rItem.name) > 0.6);

        reconciliationList.push({
          id: `rec-extra-${rIndex}`,
          status: 'unplanned',
          name: rItem.name,
          category: existingProd ? existingProd.category : guessCategoryFromName(rItem.name),
          imageUrl: existingProd?.imageUrl,
          quantity: rItem.quantity,
          unit: rItem.unit || 'un',
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
   * Applies the finalized reconciliation actions to IndexedDB
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
    reconciliationItems: ReconciliationItem[]
  ) {
    const receiptId = `receipt-${Date.now()}`;
    const purchaseDate = receiptData.purchaseDate || new Date().toISOString();

    // 1. Save Receipt
    await db.receipts.add({
      id: receiptId,
      storeName: receiptData.storeName,
      accessKey: receiptData.accessKey,
      totalAmount: receiptData.totalAmount,
      purchaseDate,
      rawType: receiptData.rawType,
      items: receiptData.items,
      createdAt: new Date().toISOString()
    });

    // 2. Process each item in reconciliation
    for (const item of reconciliationItems) {
      // Matched item
      if (item.status === 'matched') {
        if (item.listItemId) {
          // Check off in shopping list
          await db.shoppingListItems.update(item.listItemId, {
            isChecked: true,
            lastPrice: item.unitPrice || item.lastPrice
          });
        }

        // Record purchase price if available
        if (item.productId && item.unitPrice) {
          await addOrUpdatePriceHistory(
            item.productId,
            item.unitPrice,
            item.quantity,
            item.unit,
            receiptData.storeName,
            receiptId,
            purchaseDate
          );
        }
      }

      // Unplanned / Extra item
      if (item.status === 'unplanned' && item.selectedAction !== 'ignore') {
        let prodId = item.productId;
        if (!prodId) {
          prodId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          await db.products.add({
            id: prodId,
            name: item.name,
            category: item.category,
            unit: (item.unit as any) || 'un',
            averagePrice: item.unitPrice || 0,
            lastPrice: item.unitPrice || 0,
            lastPriceDate: purchaseDate,
            lastStore: receiptData.storeName,
            purchaseCount: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }

        if (item.unitPrice) {
          await addOrUpdatePriceHistory(
            prodId,
            item.unitPrice,
            item.quantity,
            item.unit,
            receiptData.storeName,
            receiptId,
            purchaseDate
          );
        }
      }

      // Unbought item
      if (item.status === 'unbought') {
        if (item.selectedAction === 'remove_from_list' && item.listItemId) {
          await db.shoppingListItems.delete(item.listItemId);
        }
        // If 'keep_in_list', we simply leave it unchecked on the list for next time!
      }
    }
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
    await db.priceRecords.add({
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId,
      receiptId,
      price: unitPrice,
      quantity,
      unit,
      storeName,
      date
    });

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
    await db.products.update(productId, {
      lastPrice: unitPrice,
      lastPriceDate: date,
      lastStore: storeName,
      averagePrice: Number(newAvg.toFixed(2)),
      purchaseCount: allRecords.length,
      updatedAt: new Date().toISOString()
    });
  }

  async function deleteReceipt(id: string) {
    await db.receipts.delete(id);
    const relatedRecords = await db.priceRecords.where('receiptId').equals(id).toArray();
    if (relatedRecords.length > 0) {
      await db.priceRecords.bulkDelete(relatedRecords.map((r) => r.id));
    }
  }

  return {
    receipts,
    generateReconciliation,
    applyReconciliation,
    deleteReceipt
  };
}

