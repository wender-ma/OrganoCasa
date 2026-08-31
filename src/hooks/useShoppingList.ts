import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect } from 'react';
import { db } from '../db/dexie';
import { ShoppingList, ShoppingListItem, ProductCategory, ProductUnit } from '../types';
import {
  pushSingleItem,
  deleteSingleItem,
  deleteMultipleItems,
  pushSingleList,
  pushSingleProduct
} from '../services/supabaseSync';

export function useShoppingList() {
  const [activeListId, setActiveListId] = useState<string>('list-default');

  const lists = useLiveQuery(() => db.shoppingLists.toArray()) || [];
  
  // Ensure default list exists
  useEffect(() => {
    if (lists.length > 0 && !lists.find((l) => l.id === activeListId)) {
      const defaultL = lists.find((l) => l.isDefault) || lists[0];
      setActiveListId(defaultL.id);
    }
  }, [lists, activeListId]);

  const activeList = lists.find((l) => l.id === activeListId);

  const items = useLiveQuery(
    () => db.shoppingListItems.where('listId').equals(activeListId).toArray(),
    [activeListId]
  ) || [];

  // Computed statistics
  const totalItemsCount = items.length;
  const checkedItemsCount = items.filter((i) => i.isChecked).length;
  const progressPercentage = totalItemsCount > 0 ? Math.round((checkedItemsCount / totalItemsCount) * 100) : 0;
  
  const estimatedTotal = items.reduce((acc, item) => {
    const priceToUse = item.averagePrice > 0 ? item.averagePrice : item.lastPrice;
    return acc + priceToUse * item.quantity;
  }, 0);

  const currentCartTotal = items
    .filter((i) => i.isChecked)
    .reduce((acc, item) => {
      const priceToUse = item.averagePrice > 0 ? item.averagePrice : item.lastPrice;
      return acc + priceToUse * item.quantity;
    }, 0);

  // Grouped by Category
  const itemsByCategory = items.reduce<Record<ProductCategory, ShoppingListItem[]>>((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<ProductCategory, ShoppingListItem[]>);

  // Actions
  async function addItem(data: {
    name: string;
    category: ProductCategory;
    quantity: number;
    unit: ProductUnit;
    brand?: string;
    alternativeBrands?: string[];
    selectedBrand?: string;
    imageUrl?: string;
    productId?: string;
    averagePrice?: number;
    lastPrice?: number;
    notes?: string;
  }) {
    // 1. Check if product already exists in DB or create it
    let prodId = data.productId;
    if (!prodId) {
      const existingProduct = await db.products
        .where('name')
        .equalsIgnoreCase(data.name.trim())
        .first();

      if (existingProduct) {
        prodId = existingProduct.id;
        data.imageUrl = data.imageUrl || existingProduct.imageUrl;
        data.brand = data.brand || existingProduct.brand;
        data.alternativeBrands = data.alternativeBrands || existingProduct.alternativeBrands;
        data.averagePrice = existingProduct.averagePrice;
        data.lastPrice = existingProduct.lastPrice;
      } else {
        prodId = `prod-${Date.now()}`;
        const newProduct = {
          id: prodId,
          name: data.name.trim(),
          category: data.category,
          brand: data.brand,
          alternativeBrands: data.alternativeBrands,
          imageUrl: data.imageUrl,
          unit: data.unit,
          averagePrice: data.averagePrice || 0,
          lastPrice: data.lastPrice || 0,
          purchaseCount: data.lastPrice ? 1 : 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await db.products.add(newProduct);
        pushSingleProduct(newProduct).catch(console.warn);
      }
    }

    const newItem: ShoppingListItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      listId: activeListId,
      productId: prodId,
      name: data.name.trim(),
      category: data.category,
      brand: data.brand,
      alternativeBrands: data.alternativeBrands,
      selectedBrand: data.selectedBrand,
      imageUrl: data.imageUrl,
      quantity: data.quantity,
      unit: data.unit,
      averagePrice: data.averagePrice || 0,
      lastPrice: data.lastPrice || 0,
      isChecked: false,
      notes: data.notes,
      createdAt: new Date().toISOString()
    };

    await db.shoppingListItems.add(newItem);
    pushSingleItem(newItem).catch(console.warn);
    return newItem;
  }

  async function toggleItem(id: string) {
    const item = await db.shoppingListItems.get(id);
    if (item) {
      const newChecked = !item.isChecked;
      await db.shoppingListItems.update(id, { isChecked: newChecked });
      pushSingleItem({ ...item, isChecked: newChecked }).catch(console.warn);
    }
  }

  async function updateItemQuantity(id: string, newQuantity: number) {
    if (newQuantity <= 0) {
      await db.shoppingListItems.delete(id);
      deleteSingleItem(id).catch(console.warn);
    } else {
      const rounded = Number(newQuantity.toFixed(2));
      await db.shoppingListItems.update(id, { quantity: rounded });
      const item = await db.shoppingListItems.get(id);
      if (item) {
        pushSingleItem(item).catch(console.warn);
      }
    }
  }

  async function updateItem(id: string, changes: Partial<ShoppingListItem>) {
    await db.shoppingListItems.update(id, changes);
    const item = await db.shoppingListItems.get(id);
    if (item) {
      pushSingleItem(item).catch(console.warn);
    }
  }

  async function removeItem(id: string) {
    await db.shoppingListItems.delete(id);
    deleteSingleItem(id).catch(console.warn);
  }

  async function clearCompletedItems() {
    const completedIds = items.filter((i) => i.isChecked).map((i) => i.id);
    if (completedIds.length > 0) {
      await db.shoppingListItems.bulkDelete(completedIds);
      deleteMultipleItems(completedIds).catch(console.warn);
    }
  }

  async function uncheckAllItems() {
    const updates = items.map((i) => {
      const updated = { ...i, isChecked: false };
      pushSingleItem(updated).catch(console.warn);
      return db.shoppingListItems.update(i.id, { isChecked: false });
    });
    await Promise.all(updates);
  }

  async function createList(title: string) {
    const newList: ShoppingList = {
      id: `list-${Date.now()}`,
      title: title.trim(),
      isDefault: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.shoppingLists.add(newList);
    pushSingleList(newList).catch(console.warn);
    setActiveListId(newList.id);
    return newList;
  }

  return {
    activeListId,
    setActiveListId,
    activeList,
    lists,
    items,
    itemsByCategory,
    totalItemsCount,
    checkedItemsCount,
    progressPercentage,
    estimatedTotal,
    currentCartTotal,
    addItem,
    toggleItem,
    updateItemQuantity,
    updateItem,
    removeItem,
    clearCompletedItems,
    uncheckAllItems,
    createList
  };
}
