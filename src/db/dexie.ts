import Dexie, { Table } from 'dexie';
import {
  Product,
  PriceRecord,
  ShoppingList,
  ShoppingListItem,
  HouseholdMember,
  Reminder,
  Receipt
} from '../types';

export class OrganoCasaDatabase extends Dexie {
  products!: Table<Product, string>;
  priceRecords!: Table<PriceRecord, string>;
  shoppingLists!: Table<ShoppingList, string>;
  shoppingListItems!: Table<ShoppingListItem, string>;
  householdMembers!: Table<HouseholdMember, string>;
  reminders!: Table<Reminder, string>;
  receipts!: Table<Receipt, string>;

  constructor() {
    super('OrganoCasaDB');
    this.version(1).stores({
      products: 'id, name, category, barcode, lastPrice, averagePrice, updatedAt',
      priceRecords: 'id, productId, receiptId, storeName, date',
      shoppingLists: 'id, title, isDefault, status, createdAt, updatedAt',
      shoppingListItems: 'id, listId, productId, name, category, isChecked, createdAt, updatedAt',
      householdMembers: 'id, name',
      reminders: 'id, assignedMemberId, isCompleted, dueDate, createdAt, updatedAt',
      receipts: 'id, storeName, purchaseDate, createdAt'
    });
  }
}

export const db = new OrganoCasaDatabase();

