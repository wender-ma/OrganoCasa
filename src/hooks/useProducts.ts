import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { Product, PriceRecord, ProductCategory, ProductUnit } from '../types';
import {
  pushSingleProduct,
  deleteSingleProduct,
  pushSinglePriceRecord,
  deleteMultiplePriceRecords,
  pushSingleItem
} from '../services/supabaseSync';

export function useProducts() {
  const products = useLiveQuery(() => db.products.orderBy('name').toArray()) || [];

  async function getProductPriceHistory(productId: string): Promise<PriceRecord[]> {
    return await db.priceRecords
      .where('productId')
      .equals(productId)
      .reverse()
      .sortBy('date');
  }

  async function addProduct(data: {
    name: string;
    category: ProductCategory;
    brand?: string;
    alternativeBrands?: string[];
    barcode?: string;
    imageUrl?: string;
    unit: ProductUnit;
    initialPrice?: number;
    storeName?: string;
  }) {
    const productId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const initialPrice = data.initialPrice || 0;
    const now = new Date().toISOString();

    const newProd: Product = {
      id: productId,
      name: data.name.trim(),
      category: data.category,
      brand: data.brand,
      alternativeBrands: data.alternativeBrands,
      barcode: data.barcode,
      imageUrl: data.imageUrl,
      unit: data.unit,
      averagePrice: initialPrice,
      lastPrice: initialPrice,
      lastPriceDate: initialPrice > 0 ? now : undefined,
      lastStore: data.storeName,
      purchaseCount: initialPrice > 0 ? 1 : 0,
      createdAt: now,
      updatedAt: now
    };

    await db.products.add(newProd);
    await pushSingleProduct(newProd).catch(console.warn);

    if (initialPrice > 0) {
      const rec: PriceRecord = {
        id: `rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId,
        price: initialPrice,
        quantity: 1,
        unit: data.unit,
        storeName: data.storeName || 'Compra Inicial',
        date: now
      };
      await db.priceRecords.add(rec);
      pushSinglePriceRecord(rec).catch(console.warn);
    }

    return newProd;
  }

  async function updateProduct(id: string, changes: Partial<Product>) {
    const updatedAt = new Date().toISOString();
    await db.products.update(id, {
      ...changes,
      updatedAt
    });
    const prod = await db.products.get(id);
    if (prod) {
      pushSingleProduct(prod).catch(console.warn);

      // Propagate metadata changes to active shopping list items referencing this product
      const matchingItems = await db.shoppingListItems.where('productId').equals(id).toArray();
      for (const item of matchingItems) {
        if (!item.isChecked) {
          const itemUpdates: Partial<Product> & Record<string, any> = { updatedAt };
          if (changes.name !== undefined) itemUpdates.name = changes.name;
          if (changes.category !== undefined) itemUpdates.category = changes.category;
          if (changes.brand !== undefined) itemUpdates.brand = changes.brand;
          if (changes.alternativeBrands !== undefined) itemUpdates.alternativeBrands = changes.alternativeBrands;
          if (changes.imageUrl !== undefined) itemUpdates.imageUrl = changes.imageUrl;
          if (changes.unit !== undefined) itemUpdates.unit = changes.unit;
          if (changes.averagePrice !== undefined) itemUpdates.averagePrice = changes.averagePrice;
          if (changes.lastPrice !== undefined) itemUpdates.lastPrice = changes.lastPrice;
          await db.shoppingListItems.update(item.id, itemUpdates);
          const updatedItem = await db.shoppingListItems.get(item.id);
          if (updatedItem) {
            pushSingleItem(updatedItem).catch(console.warn);
          }
        }
      }
    }
  }

  async function recordPurchasePrice(data: {
    productId: string;
    price: number;
    quantity: number;
    unit: string;
    storeName: string;
    receiptId?: string;
    date?: string;
  }) {
    const purchaseDate = data.date || new Date().toISOString();

    // 1. Add Price Record
    const rec: PriceRecord = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: data.productId,
      receiptId: data.receiptId,
      price: data.price,
      quantity: data.quantity,
      unit: data.unit,
      storeName: data.storeName,
      date: purchaseDate
    };
    await db.priceRecords.add(rec);
    pushSinglePriceRecord(rec).catch(console.warn);

    // 2. Fetch all historical records to re-compute real Average Price
    const allRecords = await db.priceRecords.where('productId').equals(data.productId).toArray();

    // Weighted average
    let totalSpent = 0;
    let totalQty = 0;
    allRecords.forEach((r) => {
      totalSpent += r.price * r.quantity;
      totalQty += r.quantity;
    });

    const newAveragePrice = totalQty > 0 ? totalSpent / totalQty : data.price;
    const updatedAt = new Date().toISOString();

    // 3. Update Product record
    await db.products.update(data.productId, {
      lastPrice: data.price,
      lastPriceDate: purchaseDate,
      lastStore: data.storeName,
      averagePrice: Number(newAveragePrice.toFixed(2)),
      purchaseCount: allRecords.length,
      updatedAt
    });
    const updatedProd = await db.products.get(data.productId);
    if (updatedProd) {
      pushSingleProduct(updatedProd).catch(console.warn);
    }

    // 4. Also update any active ShoppingListItems referencing this product
    const matchingListItems = await db.shoppingListItems.where('productId').equals(data.productId).toArray();
    for (const item of matchingListItems) {
      await db.shoppingListItems.update(item.id, {
        lastPrice: data.price,
        averagePrice: Number(newAveragePrice.toFixed(2)),
        updatedAt
      });
      const updatedItem = await db.shoppingListItems.get(item.id);
      if (updatedItem) {
        pushSingleItem(updatedItem).catch(console.warn);
      }
    }
  }

  async function deleteProduct(id: string) {
    await db.products.delete(id);
    deleteSingleProduct(id).catch(console.warn);

    const relatedRecords = await db.priceRecords.where('productId').equals(id).toArray();
    if (relatedRecords.length > 0) {
      const relatedIds = relatedRecords.map((r) => r.id);
      await db.priceRecords.bulkDelete(relatedIds);
      deleteMultiplePriceRecords(relatedIds).catch(console.warn);
    }
  }

  return {
    products,
    getProductPriceHistory,
    addProduct,
    updateProduct,
    recordPurchasePrice,
    deleteProduct
  };
}
