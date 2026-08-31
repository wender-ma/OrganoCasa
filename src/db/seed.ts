import { db } from './dexie';
import { Product, HouseholdMember, ShoppingList, ShoppingListItem, Reminder, PriceRecord } from '../types';

export const INITIAL_CATEGORIES = [
  'Hortifrúti',
  'Carnes e Aves',
  'Laticínios e Frios',
  'Mercearia',
  'Padaria e Sobremesas',
  'Bebidas',
  'Congelados',
  'Limpeza',
  'Higiene e Beleza',
  'Pet Shop',
  'Outros'
] as const;

export const CATEGORY_ICONS: Record<string, string> = {
  'Hortifrúti': '🍎',
  'Carnes e Aves': '🥩',
  'Laticínios e Frios': '🧀',
  'Mercearia': '🥫',
  'Padaria e Sobremesas': '🍞',
  'Bebidas': '🥤',
  'Congelados': '🧊',
  'Limpeza': '🧹',
  'Higiene e Beleza': '🧴',
  'Pet Shop': '🐾',
  'Outros': '📦'
};

export const INITIAL_MEMBERS: HouseholdMember[] = [
  {
    id: 'member-1',
    name: 'Eu',
    color: '#10b981',
    avatarEmoji: '👤',
    isDefault: true
  },
  {
    id: 'member-2',
    name: 'Esposa / Parceiro(a)',
    color: '#ec4899',
    avatarEmoji: '👩'
  }
];

// Fixed epoch date so seed data NEVER outranks real user data
const SEED_TIMESTAMP = '2020-01-01T00:00:00.000Z';

export const INITIAL_PRODUCTS: Array<{
  product: Product;
  history: PriceRecord[];
}> = [
  {
    product: {
      id: 'prod-arroz-5kg',
      name: 'Arroz Branco Tipo 1 5kg',
      category: 'Mercearia',
      brand: 'Tio João',
      alternativeBrands: ['Camil', 'Prato Fino'],
      barcode: '7891234567890',
      imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300&auto=format&fit=crop&q=80',
      unit: 'pct',
      averagePrice: 28.90,
      lastPrice: 29.50,
      lastPriceDate: '2020-01-01T14:30:00.000Z',
      lastStore: 'Supermercado Central',
      purchaseCount: 3,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-1',
        productId: 'prod-arroz-5kg',
        price: 27.90,
        quantity: 1,
        unit: 'pct',
        storeName: 'Atacadão',
        date: '2020-01-01T11:00:00.000Z'
      },
      {
        id: 'hist-2',
        productId: 'prod-arroz-5kg',
        price: 29.30,
        quantity: 1,
        unit: 'pct',
        storeName: 'Carrefour',
        date: '2020-01-01T15:00:00.000Z'
      },
      {
        id: 'hist-3',
        productId: 'prod-arroz-5kg',
        price: 29.50,
        quantity: 1,
        unit: 'pct',
        storeName: 'Supermercado Central',
        date: '2020-01-01T14:30:00.000Z'
      }
    ]
  },
  {
    product: {
      id: 'prod-feijao-1kg',
      name: 'Feijão Carioca 1kg',
      category: 'Mercearia',
      brand: 'Camil',
      alternativeBrands: ['Kicaldo', 'Tio Jorge'],
      barcode: '7891234567891',
      imageUrl: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=300&auto=format&fit=crop&q=80',
      unit: 'pct',
      averagePrice: 7.80,
      lastPrice: 8.20,
      lastPriceDate: '2020-01-01T14:30:00.000Z',
      lastStore: 'Supermercado Central',
      purchaseCount: 2,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-4',
        productId: 'prod-feijao-1kg',
        price: 7.40,
        quantity: 2,
        unit: 'pct',
        storeName: 'Atacadão',
        date: '2020-01-01T15:00:00.000Z'
      },
      {
        id: 'hist-5',
        productId: 'prod-feijao-1kg',
        price: 8.20,
        quantity: 2,
        unit: 'pct',
        storeName: 'Supermercado Central',
        date: '2020-01-01T14:30:00.000Z'
      }
    ]
  },
  {
    product: {
      id: 'prod-leite-integral-1l',
      name: 'Leite Integral UHT 1L',
      category: 'Laticínios e Frios',
      brand: 'Ninho',
      alternativeBrands: ['Piracanjuba', 'Parmalat'],
      barcode: '7891234567892',
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80',
      unit: 'cx',
      averagePrice: 4.85,
      lastPrice: 4.99,
      lastPriceDate: '2020-01-01T18:00:00.000Z',
      lastStore: 'Pão de Açúcar',
      purchaseCount: 2,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-6',
        productId: 'prod-leite-integral-1l',
        price: 4.70,
        quantity: 6,
        unit: 'cx',
        storeName: 'Atacadão',
        date: '2020-01-01T09:00:00.000Z'
      },
      {
        id: 'hist-7',
        productId: 'prod-leite-integral-1l',
        price: 4.99,
        quantity: 4,
        unit: 'cx',
        storeName: 'Pão de Açúcar',
        date: '2020-01-01T18:00:00.000Z'
      }
    ]
  },
  {
    product: {
      id: 'prod-cafe-500g',
      name: 'Café Torrado e Moído 500g',
      category: 'Mercearia',
      brand: 'Pilão',
      alternativeBrands: ['Melitta', '3 Corações'],
      barcode: '7891234567893',
      imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&auto=format&fit=crop&q=80',
      unit: 'pct',
      averagePrice: 17.50,
      lastPrice: 18.90,
      lastPriceDate: '2020-01-01T14:30:00.000Z',
      lastStore: 'Supermercado Central',
      purchaseCount: 2,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-8',
        productId: 'prod-cafe-500g',
        price: 16.10,
        quantity: 1,
        unit: 'pct',
        storeName: 'Atacadão',
        date: '2020-01-01T14:00:00.000Z'
      },
      {
        id: 'hist-9',
        productId: 'prod-cafe-500g',
        price: 18.90,
        quantity: 1,
        unit: 'pct',
        storeName: 'Supermercado Central',
        date: '2020-01-01T14:30:00.000Z'
      }
    ]
  },
  {
    product: {
      id: 'prod-azeite-500ml',
      name: 'Azeite de Oliva Extra Virgem 500ml',
      category: 'Mercearia',
      brand: 'Gallo',
      alternativeBrands: ['Andorinha', 'Borges'],
      barcode: '7891234567894',
      imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300&auto=format&fit=crop&q=80',
      unit: 'un',
      averagePrice: 36.90,
      lastPrice: 38.50,
      lastPriceDate: '2020-01-01T12:00:00.000Z',
      lastStore: 'Carrefour',
      purchaseCount: 2,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-10',
        productId: 'prod-azeite-500ml',
        price: 35.30,
        quantity: 1,
        unit: 'un',
        storeName: 'Atacadão',
        date: '2020-01-01T10:00:00.000Z'
      },
      {
        id: 'hist-11',
        productId: 'prod-azeite-500ml',
        price: 38.50,
        quantity: 1,
        unit: 'un',
        storeName: 'Carrefour',
        date: '2020-01-01T12:00:00.000Z'
      }
    ]
  },
  {
    product: {
      id: 'prod-banana-prata',
      name: 'Banana Prata',
      category: 'Hortifrúti',
      barcode: '7891234567895',
      imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=300&auto=format&fit=crop&q=80',
      unit: 'kg',
      averagePrice: 6.99,
      lastPrice: 7.49,
      lastPriceDate: '2020-01-01T16:00:00.000Z',
      lastStore: 'Hortifruti Natural',
      purchaseCount: 2,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-12',
        productId: 'prod-banana-prata',
        price: 6.49,
        quantity: 1.5,
        unit: 'kg',
        storeName: 'Supermercado Central',
        date: '2020-01-01T10:00:00.000Z'
      },
      {
        id: 'hist-13',
        productId: 'prod-banana-prata',
        price: 7.49,
        quantity: 1.2,
        unit: 'kg',
        storeName: 'Hortifruti Natural',
        date: '2020-01-01T16:00:00.000Z'
      }
    ]
  },
  {
    product: {
      id: 'prod-ovos-30un',
      name: 'Cartela de Ovos Brancos 30un',
      category: 'Laticínios e Frios',
      brand: 'Granja Mantiqueira',
      alternativeBrands: ['Qualitá', 'Granja São Pedro'],
      barcode: '7891234567896',
      imageUrl: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=300&auto=format&fit=crop&q=80',
      unit: 'cx',
      averagePrice: 19.90,
      lastPrice: 19.90,
      lastPriceDate: '2020-01-01T14:30:00.000Z',
      lastStore: 'Supermercado Central',
      purchaseCount: 1,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-14',
        productId: 'prod-ovos-30un',
        price: 19.90,
        quantity: 1,
        unit: 'cx',
        storeName: 'Supermercado Central',
        date: '2020-01-01T14:30:00.000Z'
      }
    ]
  },
  {
    product: {
      id: 'prod-detergente-500ml',
      name: 'Detergente Líquido 500ml',
      category: 'Limpeza',
      brand: 'Ypê',
      alternativeBrands: ['Limpol', 'Minuano'],
      barcode: '7891234567897',
      imageUrl: 'https://images.unsplash.com/photo-1585670270608-b4be4fb88f8d?w=300&auto=format&fit=crop&q=80',
      unit: 'un',
      averagePrice: 2.75,
      lastPrice: 2.89,
      lastPriceDate: '2020-01-01T14:30:00.000Z',
      lastStore: 'Supermercado Central',
      purchaseCount: 2,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    history: [
      {
        id: 'hist-15',
        productId: 'prod-detergente-500ml',
        price: 2.60,
        quantity: 3,
        unit: 'un',
        storeName: 'Atacadão',
        date: '2020-01-01T14:00:00.000Z'
      },
      {
        id: 'hist-16',
        productId: 'prod-detergente-500ml',
        price: 2.89,
        quantity: 2,
        unit: 'un',
        storeName: 'Supermercado Central',
        date: '2020-01-01T14:30:00.000Z'
      }
    ]
  }
];

export async function clearSeedData() {
  await db.transaction('rw', [db.shoppingListItems, db.shoppingLists, db.reminders, db.products, db.priceRecords], async () => {
    // Delete any items created with SEED_TIMESTAMP
    await db.shoppingListItems.where('createdAt').equals(SEED_TIMESTAMP).delete();
    await db.shoppingLists.where('createdAt').equals(SEED_TIMESTAMP).delete();
    await db.reminders.where('createdAt').equals(SEED_TIMESTAMP).delete();
    await db.products.where('createdAt').equals(SEED_TIMESTAMP).delete();
  });
}

export async function seedDatabase() {
  // If user is already logged in with a real session, do not inject seed items
  const hasUserSession = typeof localStorage !== 'undefined' && localStorage.getItem('organocasa_user_session');
  const productsCount = await db.products.count();
  if (productsCount > 0 || hasUserSession) return;

  console.log('Seeding initial OrganoCasa database...');

  // 1. Members
  await db.householdMembers.bulkAdd(INITIAL_MEMBERS);

  // 2. Default Shopping List with epoch timestamp
  const defaultList: ShoppingList = {
    id: 'list-default',
    title: 'Compras do Supermercado',
    isDefault: true,
    status: 'active',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  };
  await db.shoppingLists.add(defaultList);

  // 3. Products and Price History
  for (const item of INITIAL_PRODUCTS) {
    await db.products.add(item.product);
    await db.priceRecords.bulkAdd(item.history);
  }

  // 4. Initial Items in the Shopping List
  const sampleListItems: ShoppingListItem[] = [
    {
      id: 'seed-item-1',
      listId: defaultList.id,
      productId: 'prod-arroz-5kg',
      name: 'Arroz Branco Tipo 1 5kg',
      category: 'Mercearia',
      brand: 'Tio João',
      alternativeBrands: ['Camil', 'Prato Fino'],
      imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300&auto=format&fit=crop&q=80',
      quantity: 1,
      unit: 'pct',
      averagePrice: 28.90,
      lastPrice: 29.50,
      isChecked: false,
      notes: 'Priorizar Tio João, ou Camil como reserva',
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    {
      id: 'seed-item-2',
      listId: defaultList.id,
      productId: 'prod-feijao-1kg',
      name: 'Feijão Carioca 1kg',
      category: 'Mercearia',
      brand: 'Camil',
      alternativeBrands: ['Kicaldo', 'Tio Jorge'],
      imageUrl: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=300&auto=format&fit=crop&q=80',
      quantity: 2,
      unit: 'pct',
      averagePrice: 7.80,
      lastPrice: 8.20,
      isChecked: false,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    {
      id: 'seed-item-3',
      listId: defaultList.id,
      productId: 'prod-leite-integral-1l',
      name: 'Leite Integral UHT 1L',
      category: 'Laticínios e Frios',
      brand: 'Ninho',
      alternativeBrands: ['Piracanjuba', 'Parmalat'],
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80',
      quantity: 6,
      unit: 'cx',
      averagePrice: 4.85,
      lastPrice: 4.99,
      isChecked: true,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    {
      id: 'seed-item-4',
      listId: defaultList.id,
      productId: 'prod-cafe-500g',
      name: 'Café Torrado e Moído 500g',
      category: 'Mercearia',
      brand: 'Pilão',
      alternativeBrands: ['Melitta', '3 Corações'],
      imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&auto=format&fit=crop&q=80',
      quantity: 1,
      unit: 'pct',
      averagePrice: 17.50,
      lastPrice: 18.90,
      isChecked: false,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    {
      id: 'seed-item-5',
      listId: defaultList.id,
      productId: 'prod-banana-prata',
      name: 'Banana Prata',
      category: 'Hortifrúti',
      imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=300&auto=format&fit=crop&q=80',
      quantity: 1.5,
      unit: 'kg',
      averagePrice: 6.99,
      lastPrice: 7.49,
      isChecked: false,
      notes: 'Preferir mais verde para amadurecer',
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    }
  ];
  await db.shoppingListItems.bulkAdd(sampleListItems);

  // 5. Initial Reminders
  const initialReminders: Reminder[] = [
    {
      id: 'seed-rem-1',
      title: 'Pegar itens na casa da sogra',
      description: 'Lembrar de passar no final da tarde de domingo',
      assignedMemberId: 'member-1',
      checklist: [
        { id: 'chk-1', text: 'Arroz', isDone: false },
        { id: 'chk-2', text: 'Manteiga caseira', isDone: true },
        { id: 'chk-3', text: 'Galão de água mineral', isDone: false }
      ],
      dueDate: '2026-12-31',
      isCompleted: false,
      category: 'Família',
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    },
    {
      id: 'seed-rem-2',
      title: 'Descongelar carne para o almoço',
      description: 'Tirar o frango do freezer',
      assignedMemberId: 'member-2',
      checklist: [
        { id: 'chk-4', text: 'Tirar peito de frango do congelador', isDone: false }
      ],
      dueDate: '2026-12-31',
      isCompleted: false,
      category: 'Cozinha',
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    }
  ];
  await db.reminders.bulkAdd(initialReminders);

  console.log('OrganoCasa database successfully initialized!');
}
