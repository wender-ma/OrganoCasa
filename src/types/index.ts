export type ProductCategory =
  | 'Hortifrúti'
  | 'Carnes e Aves'
  | 'Laticínios e Frios'
  | 'Mercearia'
  | 'Padaria e Sobremesas'
  | 'Bebidas'
  | 'Congelados'
  | 'Limpeza'
  | 'Higiene e Beleza'
  | 'Pet Shop'
  | 'Outros';

export type ProductUnit = 'un' | 'kg' | 'g' | 'l' | 'ml' | 'pct' | 'cx' | 'dz';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  brand?: string; // Marca principal/preferida (1ª Opção)
  alternativeBrands?: string[]; // Marcas alternativas (2ª e 3ª Opções)
  barcode?: string;
  imageUrl?: string;
  unit: ProductUnit;
  averagePrice: number;
  lastPrice: number;
  lastPriceDate?: string;
  lastStore?: string;
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceRecord {
  id: string;
  productId: string;
  receiptId?: string;
  price: number; // Unit price
  quantity: number;
  unit: string;
  storeName: string;
  date: string; // ISO format
}

export interface ShoppingList {
  id: string;
  title: string;
  isDefault: boolean;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListItem {
  id: string;
  listId: string;
  productId?: string;
  name: string;
  category: ProductCategory;
  brand?: string; // Marca principal/preferida (1ª Opção)
  alternativeBrands?: string[]; // Marcas alternativas (2ª e 3ª Opções)
  selectedBrand?: string; // Marca comprada/escolhida no supermercado
  imageUrl?: string;
  quantity: number;
  unit: ProductUnit;
  averagePrice: number;
  lastPrice: number;
  isChecked: boolean;
  notes?: string;
  createdAt: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  color: string; // Hex color code or tailwind color
  avatarEmoji?: string;
  isDefault?: boolean;
}

export interface ReminderCheckItem {
  id: string;
  text: string;
  isDone: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  assignedMemberId?: string;
  checklist: ReminderCheckItem[];
  dueDate?: string;
  isCompleted: boolean;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptItem {
  id?: string;
  name: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit: string;
}

export interface Receipt {
  id: string;
  listId?: string;
  storeName: string;
  accessKey?: string;
  totalAmount: number;
  purchaseDate: string;
  rawType: 'qr_code' | 'xml' | 'ocr_image' | 'manual';
  items: ReceiptItem[];
  createdAt: string;
}

export type ReconciliationStatus = 'matched' | 'unplanned' | 'unbought';

export interface ReconciliationItem {
  id: string;
  status: ReconciliationStatus;
  name: string;
  category: ProductCategory;
  brand?: string;
  alternativeBrands?: string[];
  imageUrl?: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
  lastPrice?: number;
  averagePrice?: number;
  // Associated entities if matched
  listItemId?: string;
  productId?: string;
  selectedAction?: 'keep_in_list' | 'remove_from_list' | 'add_to_catalog' | 'ignore';
}

