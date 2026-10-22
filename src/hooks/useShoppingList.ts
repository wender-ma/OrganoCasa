import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { ShoppingList, ShoppingListItem, ProductCategory, ProductUnit } from '../types';
import {
  pushSingleItem,
  deleteSingleItem,
  deleteMultipleItems,
  pushSingleList,
  pushSingleProduct,
  getCurrentSession
} from '../services/supabaseSync';

function useShoppingListState() {
  const [activeListId, setActiveListId] = useState<string>('list-default');

  const lists = useLiveQuery(() => db.shoppingLists.toArray()) || [];

  // Ensure default/active list selection stays synchronized with available lists
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
  const pendingItemsCount = items.filter((i) => !i.isChecked).length;
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

  // Ensure an active list exists in IndexedDB (auto-creates a default list with a unique ID per household if empty)
  async function ensureActiveList(): Promise<string> {
    const current = await db.shoppingLists.get(activeListId);
    if (current) return current.id;

    const existingLists = await db.shoppingLists.toArray();
    if (existingLists.length > 0) {
      const chosen = existingLists.find((l) => l.isDefault) || existingLists[0];
      setActiveListId(chosen.id);
      return chosen.id;
    }

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
    setActiveListId(newDefaultList.id);
    return newDefaultList.id;
  }

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
    const targetListId = await ensureActiveList();
    const now = new Date().toISOString();

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
        prodId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
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
          createdAt: now,
          updatedAt: now
        };
        await db.products.add(newProduct);
        await pushSingleProduct(newProduct).catch(console.warn);
      }
    }

    const newItem: ShoppingListItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      listId: targetListId,
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
      createdAt: now,
      updatedAt: now
    };

    await db.shoppingListItems.add(newItem);
    pushSingleItem(newItem).catch(console.warn);
    return newItem;
  }

  async function toggleItem(id: string) {
    const item = await db.shoppingListItems.get(id);
    if (item) {
      const newChecked = !item.isChecked;
      const updatedAt = new Date().toISOString();
      await db.shoppingListItems.update(id, { isChecked: newChecked, updatedAt });
      pushSingleItem({ ...item, isChecked: newChecked, updatedAt }).catch(console.warn);
    }
  }

  async function updateItemQuantity(id: string, newQuantity: number) {
    if (newQuantity <= 0) {
      await db.shoppingListItems.delete(id);
      deleteSingleItem(id).catch(console.warn);
    } else {
      const rounded = Number(newQuantity.toFixed(2));
      const updatedAt = new Date().toISOString();
      await db.shoppingListItems.update(id, { quantity: rounded, updatedAt });
      const item = await db.shoppingListItems.get(id);
      if (item) {
        pushSingleItem(item).catch(console.warn);
      }
    }
  }

  async function updateItem(id: string, changes: Partial<ShoppingListItem>) {
    const updatedAt = new Date().toISOString();
    await db.shoppingListItems.update(id, { ...changes, updatedAt });
    const item = await db.shoppingListItems.get(id);
    if (item) {
      pushSingleItem(item).catch(console.warn);

      // Keep linked catalog product synchronized when brand, alternativeBrands, imageUrl, category, or unit are edited
      if (item.productId) {
        const prodUpdates: Record<string, any> = {};
        if (changes.brand !== undefined) prodUpdates.brand = changes.brand;
        if (changes.alternativeBrands !== undefined) prodUpdates.alternativeBrands = changes.alternativeBrands;
        if (changes.imageUrl !== undefined) prodUpdates.imageUrl = changes.imageUrl;
        if (changes.category !== undefined) prodUpdates.category = changes.category;
        if (changes.unit !== undefined) prodUpdates.unit = changes.unit;

        if (Object.keys(prodUpdates).length > 0) {
          prodUpdates.updatedAt = updatedAt;
          await db.products.update(item.productId, prodUpdates);
          const updatedProd = await db.products.get(item.productId);
          if (updatedProd) {
            pushSingleProduct(updatedProd).catch(console.warn);
          }
        }
      }
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
    const updatedAt = new Date().toISOString();
    const updates = items.map((i) => {
      const updated = { ...i, isChecked: false, updatedAt };
      pushSingleItem(updated).catch(console.warn);
      return db.shoppingListItems.update(i.id, { isChecked: false, updatedAt });
    });
    await Promise.all(updates);
  }

  async function createList(title: string) {
    const session = getCurrentSession();
    const houseSuffix = session?.householdId
      ? session.householdId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)
      : Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const existingCount = await db.shoppingLists.count();
    const newList: ShoppingList = {
      id: `list-${Date.now()}-${houseSuffix}`,
      title: title.trim(),
      isDefault: existingCount === 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
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
    pendingItemsCount,
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

export type ShoppingListContextValue = ReturnType<typeof useShoppingListState>;

const ShoppingListContext = createContext<ShoppingListContextValue | null>(null);

export const ShoppingListProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useShoppingListState();
  return React.createElement(ShoppingListContext.Provider, { value }, children);
};

export function useShoppingList(): ShoppingListContextValue {
  const context = useContext(ShoppingListContext);
  if (!context) {
    throw new Error('useShoppingList deve ser utilizado dentro de um ShoppingListProvider');
  }
  return context;
}
