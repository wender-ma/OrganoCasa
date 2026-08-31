import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { Product, PriceRecord, ProductCategory, ProductUnit } from '../types';

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
    const productId = `prod-${Date.now()}`;
    const initialPrice = data.initialPrice || 0;

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
      lastPriceDate: initialPrice > 0 ? new Date().toISOString() : undefined,
      lastStore: data.storeName,
      purchaseCount: initialPrice > 0 ? 1 : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.products.add(newProd);

    if (initialPrice > 0) {
      await db.priceRecords.add({
        id: `rec-${Date.now()}`,
        productId,
        price: initialPrice,
        quantity: 1,
        unit: data.unit,
        storeName: data.storeName || 'Compra Inicial',
        date: new Date().toISOString()
      });
    }

    return newProd;
  }

  async function updateProduct(id: string, changes: Partial<Product>) {
    await db.products.update(id, {
      ...changes,
      updatedAt: new Date().toISOString()
    });
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
    await db.priceRecords.add({
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: data.productId,
      receiptId: data.receiptId,
      price: data.price,
      quantity: data.quantity,
      unit: data.unit,
      storeName: data.storeName,
      date: purchaseDate
    });

    // 2. Fetch all historical records to re-compute real Average Price
    const allRecords = await db.priceRecords.where('productId').equals(data.productId).toArray();
    
    // Weighted or arithmetic average
    let totalSpent = 0;
    let totalQty = 0;
    allRecords.forEach((r) => {
      totalSpent += r.price * r.quantity;
      totalQty += r.quantity;
    });

    const newAveragePrice = totalQty > 0 ? totalSpent / totalQty : data.price;

    // 3. Update Product record
    await db.products.update(data.productId, {
      lastPrice: data.price,
      lastPriceDate: purchaseDate,
      lastStore: data.storeName,
      averagePrice: Number(newAveragePrice.toFixed(2)),
      purchaseCount: allRecords.length,
      updatedAt: new Date().toISOString()
    });

    // 4. Also update any active ShoppingListItems referencing this product
    const matchingListItems = await db.shoppingListItems.where('productId').equals(data.productId).toArray();
    for (const item of matchingListItems) {
      await db.shoppingListItems.update(item.id, {
        lastPrice: data.price,
        averagePrice: Number(newAveragePrice.toFixed(2))
      });
    }
  }

  async function deleteProduct(id: string) {
    await db.products.delete(id);
    const relatedRecords = await db.priceRecords.where('productId').equals(id).toArray();
    if (relatedRecords.length > 0) {
      await db.priceRecords.bulkDelete(relatedRecords.map((r) => r.id));
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

