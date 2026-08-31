import { db } from '../db/dexie';
import { getSupabaseClient, getSupabaseConfig } from './supabase';
import {
  Product,
  ShoppingList,
  ShoppingListItem,
  Reminder,
  HouseholdMember,
  Receipt,
  PriceRecord
} from '../types';

export interface UserSession {
  email: string;
  id: string;
  householdId: string;
  householdName: string;
  inviteCode?: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  isRealtimeActive: boolean;
}

let syncStatusListeners: Array<(status: SyncStatus) => void> = [];
let currentSyncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncedAt: localStorage.getItem('organocasa_last_synced_at'),
  errorMessage: null,
  isRealtimeActive: false
};

function notifyStatusChange() {
  syncStatusListeners.forEach((listener) => listener({ ...currentSyncStatus }));
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncStatusListeners.push(listener);
  listener({ ...currentSyncStatus });
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== listener);
  };
}

export function getCurrentSession(): UserSession | null {
  const data = localStorage.getItem('organocasa_user_session');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveCurrentSession(session: UserSession | null) {
  if (!session) {
    localStorage.removeItem('organocasa_user_session');
  } else {
    localStorage.setItem('organocasa_user_session', JSON.stringify(session));
  }
}

/**
 * Generate a friendly household ID and invite code
 */
function generateInviteCode(): string {
  return `CASA-${Math.floor(100000 + Math.random() * 900000)}`;
}

/**
 * Authentication with Supabase or Local Fallback
 */
export async function authenticateWithEmail(
  email: string,
  pass: string,
  mode: 'login' | 'signup'
): Promise<UserSession> {
  const client = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();

  if (client) {
    if (mode === 'signup') {
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: pass
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Não foi possível criar a conta.');

      const userId = data.user.id;
      const householdId = `house-${userId.substring(0, 8)}`;
      const inviteCode = generateInviteCode();
      const householdName = `Casa de ${cleanEmail.split('@')[0]}`;

      // Insert default household in Supabase
      await client.from('households').upsert({
        id: householdId,
        name: householdName,
        invite_code: inviteCode,
        created_by: userId
      });

      await client.from('household_members').upsert({
        id: `member-${userId.substring(0, 8)}`,
        household_id: householdId,
        user_id: userId,
        name: cleanEmail.split('@')[0],
        is_default: true
      });

      const session: UserSession = {
        email: cleanEmail,
        id: userId,
        householdId,
        householdName,
        inviteCode
      };

      saveCurrentSession(session);
      await triggerFullSync();
      setupRealtimeSubscriptions();
      return session;
    } else {
      // Login
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: pass
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Credenciais inválidas.');

      const userId = data.user.id;

      // Find user household in Supabase
      const { data: memberData } = await client
        .from('household_members')
        .select('household_id, households(id, name, invite_code)')
        .eq('user_id', userId)
        .single();

      const householdId = memberData?.household_id || `house-${userId.substring(0, 8)}`;
      const householdObj = (memberData as any)?.households;
      const householdName = householdObj?.name || `Casa de ${cleanEmail.split('@')[0]}`;
      const inviteCode = householdObj?.invite_code || generateInviteCode();

      const session: UserSession = {
        email: cleanEmail,
        id: userId,
        householdId,
        householdName,
        inviteCode
      };

      saveCurrentSession(session);
      await triggerFullSync();
      setupRealtimeSubscriptions();
      return session;
    }
  }

  // Local Offline-First Mock if Supabase is not configured
  const userId = `usr-${btoa(cleanEmail).substring(0, 10).toLowerCase()}`;
  const householdId = `house-${userId}`;
  const inviteCode = generateInviteCode();

  const session: UserSession = {
    email: cleanEmail,
    id: userId,
    householdId,
    householdName: 'Casa de ' + cleanEmail.split('@')[0],
    inviteCode
  };

  saveCurrentSession(session);
  return session;
}

export async function logoutUser(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    await client.auth.signOut().catch(console.error);
  }
  saveCurrentSession(null);
  currentSyncStatus = {
    ...currentSyncStatus,
    isRealtimeActive: false
  };
  notifyStatusChange();
}

/**
 * Join another household using an invite code (Family Pairing)
 */
export async function joinHouseholdByCode(inviteCode: string): Promise<UserSession> {
  const cleanCode = inviteCode.trim().toUpperCase();
  const current = getCurrentSession();
  if (!current) throw new Error('Você precisa estar logado para entrar em uma casa.');

  const client = getSupabaseClient();
  if (client) {
    const { data: household, error } = await client
      .from('households')
      .select('id, name, invite_code')
      .eq('invite_code', cleanCode)
      .single();

    if (error || !household) {
      throw new Error('Código de convite não encontrado ou inválido.');
    }

    // Associate member with this household
    await client.from('household_members').upsert({
      id: `member-${current.id.substring(0, 8)}-${household.id.substring(0, 6)}`,
      household_id: household.id,
      user_id: current.id,
      name: current.email.split('@')[0],
      is_default: false
    });

    const updatedSession: UserSession = {
      ...current,
      householdId: household.id,
      householdName: household.name,
      inviteCode: household.invite_code
    };

    saveCurrentSession(updatedSession);
    await triggerFullSync();
    setupRealtimeSubscriptions();
    return updatedSession;
  }

  // Offline mock pairing
  const updatedSession: UserSession = {
    ...current,
    householdId: `house-${cleanCode}`,
    householdName: `Casa Conectada (${cleanCode})`,
    inviteCode: cleanCode
  };
  saveCurrentSession(updatedSession);
  return updatedSession;
}

/**
 * Full bi-directional sync between IndexedDB (Dexie) and Supabase
 */
export async function triggerFullSync(): Promise<boolean> {
  const client = getSupabaseClient();
  const session = getCurrentSession();

  if (!client || !session || !navigator.onLine) {
    return false;
  }

  currentSyncStatus = {
    ...currentSyncStatus,
    isSyncing: true,
    errorMessage: null
  };
  notifyStatusChange();

  const householdId = session.householdId;

  try {
    // -------------------------------------------------------------
    // 1. PUSH LOCAL ITEMS TO SUPABASE
    // -------------------------------------------------------------
    const localProducts = await db.products.toArray();
    const localLists = await db.shoppingLists.toArray();
    const localItems = await db.shoppingListItems.toArray();
    const localReminders = await db.reminders.toArray();
    const localReceipts = await db.receipts.toArray();
    const localPriceRecords = await db.priceRecords.toArray();

    // Push Products
    if (localProducts.length > 0) {
      const productPayload = localProducts.map((p) => ({
        id: p.id,
        household_id: householdId,
        name: p.name,
        category: p.category,
        brand: p.brand || null,
        alternative_brands: p.alternativeBrands || [],
        barcode: p.barcode || null,
        image_url: p.imageUrl || null,
        unit: p.unit,
        average_price: p.averagePrice || 0,
        last_price: p.lastPrice || 0,
        last_price_date: p.lastPriceDate || null,
        last_store: p.lastStore || null,
        purchase_count: p.purchaseCount || 0,
        created_at: p.createdAt,
        updated_at: p.updatedAt
      }));
      await client.from('products').upsert(productPayload, { onConflict: 'id' });
    }

    // Push Shopping Lists
    if (localLists.length > 0) {
      const listPayload = localLists.map((l) => ({
        id: l.id,
        household_id: householdId,
        title: l.title,
        is_default: l.isDefault,
        status: l.status,
        created_at: l.createdAt,
        updated_at: l.updatedAt
      }));
      await client.from('shopping_lists').upsert(listPayload, { onConflict: 'id' });
    }

    // Push Shopping List Items
    if (localItems.length > 0) {
      const itemPayload = localItems.map((i) => ({
        id: i.id,
        household_id: householdId,
        list_id: i.listId,
        product_id: i.productId || null,
        name: i.name,
        category: i.category,
        brand: i.brand || null,
        alternative_brands: i.alternativeBrands || [],
        selected_brand: i.selectedBrand || null,
        image_url: i.imageUrl || null,
        quantity: i.quantity,
        unit: i.unit,
        average_price: i.averagePrice || 0,
        last_price: i.lastPrice || 0,
        is_checked: i.isChecked,
        notes: i.notes || null,
        created_at: i.createdAt,
        updated_at: new Date().toISOString()
      }));
      await client.from('shopping_list_items').upsert(itemPayload, { onConflict: 'id' });
    }

    // Push Reminders
    if (localReminders.length > 0) {
      const reminderPayload = localReminders.map((r) => ({
        id: r.id,
        household_id: householdId,
        title: r.title,
        description: r.description || null,
        assigned_member_id: r.assignedMemberId || null,
        checklist: r.checklist || [],
        due_date: r.dueDate || null,
        is_completed: r.isCompleted,
        category: r.category || null,
        created_at: r.createdAt,
        updated_at: r.updatedAt
      }));
      await client.from('reminders').upsert(reminderPayload, { onConflict: 'id' });
    }

    // Push Receipts
    if (localReceipts.length > 0) {
      const receiptPayload = localReceipts.map((rc) => ({
        id: rc.id,
        household_id: householdId,
        list_id: rc.listId || null,
        store_name: rc.storeName,
        access_key: rc.accessKey || null,
        total_amount: rc.totalAmount,
        purchase_date: rc.purchaseDate,
        raw_type: rc.rawType,
        items: rc.items || [],
        created_at: rc.createdAt
      }));
      await client.from('receipts').upsert(receiptPayload, { onConflict: 'id' });
    }

    // Push Price Records
    if (localPriceRecords.length > 0) {
      const pricePayload = localPriceRecords.map((pr) => ({
        id: pr.id,
        household_id: householdId,
        product_id: pr.productId,
        receipt_id: pr.receiptId || null,
        price: pr.price,
        quantity: pr.quantity,
        unit: pr.unit,
        store_name: pr.storeName,
        date: pr.date,
        created_at: pr.date
      }));
      await client.from('price_records').upsert(pricePayload, { onConflict: 'id' });
    }

    // -------------------------------------------------------------
    // 2. PULL REMOTE ITEMS FROM SUPABASE
    // -------------------------------------------------------------
    const [
      { data: remoteProducts },
      { data: remoteLists },
      { data: remoteItems },
      { data: remoteReminders },
      { data: remoteReceipts },
      { data: remotePriceRecords }
    ] = await Promise.all([
      client.from('products').select('*').eq('household_id', householdId),
      client.from('shopping_lists').select('*').eq('household_id', householdId),
      client.from('shopping_list_items').select('*').eq('household_id', householdId),
      client.from('reminders').select('*').eq('household_id', householdId),
      client.from('receipts').select('*').eq('household_id', householdId),
      client.from('price_records').select('*').eq('household_id', householdId)
    ]);

    // Merge into local Dexie
    if (remoteProducts?.length) {
      const formattedProducts: Product[] = remoteProducts.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        brand: p.brand || undefined,
        alternativeBrands: p.alternative_brands || undefined,
        barcode: p.barcode || undefined,
        imageUrl: p.image_url || undefined,
        unit: p.unit,
        averagePrice: Number(p.average_price || 0),
        lastPrice: Number(p.last_price || 0),
        lastPriceDate: p.last_price_date || undefined,
        lastStore: p.last_store || undefined,
        purchaseCount: Number(p.purchase_count || 0),
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }));
      await db.products.bulkPut(formattedProducts);
    }

    if (remoteLists?.length) {
      const formattedLists: ShoppingList[] = remoteLists.map((l: any) => ({
        id: l.id,
        title: l.title,
        isDefault: Boolean(l.is_default),
        status: l.status || 'active',
        createdAt: l.created_at,
        updatedAt: l.updated_at
      }));
      await db.shoppingLists.bulkPut(formattedLists);
    }

    if (remoteItems?.length) {
      const formattedItems: ShoppingListItem[] = remoteItems.map((i: any) => ({
        id: i.id,
        listId: i.list_id,
        productId: i.product_id || undefined,
        name: i.name,
        category: i.category,
        brand: i.brand || undefined,
        alternativeBrands: i.alternative_brands || undefined,
        selectedBrand: i.selected_brand || undefined,
        imageUrl: i.image_url || undefined,
        quantity: Number(i.quantity || 1),
        unit: i.unit,
        averagePrice: Number(i.average_price || 0),
        lastPrice: Number(i.last_price || 0),
        isChecked: Boolean(i.is_checked),
        notes: i.notes || undefined,
        createdAt: i.created_at
      }));
      await db.shoppingListItems.bulkPut(formattedItems);
    }

    if (remoteReminders?.length) {
      const formattedReminders: Reminder[] = remoteReminders.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description || undefined,
        assignedMemberId: r.assigned_member_id || undefined,
        checklist: r.checklist || [],
        dueDate: r.due_date || undefined,
        isCompleted: Boolean(r.is_completed),
        category: r.category || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
      await db.reminders.bulkPut(formattedReminders);
    }

    if (remoteReceipts?.length) {
      const formattedReceipts: Receipt[] = remoteReceipts.map((rc: any) => ({
        id: rc.id,
        listId: rc.list_id || undefined,
        storeName: rc.store_name,
        accessKey: rc.access_key || undefined,
        totalAmount: Number(rc.total_amount || 0),
        purchaseDate: rc.purchase_date,
        rawType: rc.raw_type || 'qr_code',
        items: rc.items || [],
        createdAt: rc.created_at
      }));
      await db.receipts.bulkPut(formattedReceipts);
    }

    if (remotePriceRecords?.length) {
      const formattedPrices: PriceRecord[] = remotePriceRecords.map((pr: any) => ({
        id: pr.id,
        productId: pr.product_id,
        receiptId: pr.receipt_id || undefined,
        price: Number(pr.price || 0),
        quantity: Number(pr.quantity || 1),
        unit: pr.unit,
        storeName: pr.store_name,
        date: pr.date
      }));
      await db.priceRecords.bulkPut(formattedPrices);
    }

    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('organocasa_last_synced_at', now);

    currentSyncStatus = {
      isSyncing: false,
      lastSyncedAt: now,
      errorMessage: null,
      isRealtimeActive: true
    };
    notifyStatusChange();
    return true;
  } catch (error: any) {
    console.warn('Erro durante sincronização com Supabase:', error);
    currentSyncStatus = {
      ...currentSyncStatus,
      isSyncing: false,
      errorMessage: error.message || 'Falha ao sincronizar com a nuvem.'
    };
    notifyStatusChange();
    return false;
  }
}

/**
 * Setup Realtime Subscriptions (WebSockets) for instant multi-device collaboration
 */
let realtimeChannel: any = null;

export function setupRealtimeSubscriptions(): void {
  const client = getSupabaseClient();
  const session = getCurrentSession();

  if (!client || !session) return;

  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const householdId = session.householdId;

  realtimeChannel = client
    .channel(`household-sync-${householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shopping_list_items',
        filter: `household_id=eq.${householdId}`
      },
      async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const item = payload.new as any;
          await db.shoppingListItems.put({
            id: item.id,
            listId: item.list_id,
            productId: item.product_id || undefined,
            name: item.name,
            category: item.category,
            brand: item.brand || undefined,
            alternativeBrands: item.alternative_brands || undefined,
            selectedBrand: item.selected_brand || undefined,
            imageUrl: item.image_url || undefined,
            quantity: Number(item.quantity || 1),
            unit: item.unit,
            averagePrice: Number(item.average_price || 0),
            lastPrice: Number(item.last_price || 0),
            isChecked: Boolean(item.is_checked),
            notes: item.notes || undefined,
            createdAt: item.created_at
          });
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            await db.shoppingListItems.delete(payload.old.id);
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shopping_lists',
        filter: `household_id=eq.${householdId}`
      },
      async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const list = payload.new as any;
          await db.shoppingLists.put({
            id: list.id,
            title: list.title,
            isDefault: Boolean(list.is_default),
            status: list.status || 'active',
            createdAt: list.created_at,
            updatedAt: list.updated_at
          });
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            await db.shoppingLists.delete(payload.old.id);
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reminders',
        filter: `household_id=eq.${householdId}`
      },
      async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rem = payload.new as any;
          await db.reminders.put({
            id: rem.id,
            title: rem.title,
            description: rem.description || undefined,
            assignedMemberId: rem.assigned_member_id || undefined,
            checklist: rem.checklist || [],
            dueDate: rem.due_date || undefined,
            isCompleted: Boolean(rem.is_completed),
            category: rem.category || undefined,
            createdAt: rem.created_at,
            updatedAt: rem.updated_at
          });
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            await db.reminders.delete(payload.old.id);
          }
        }
      }
    )
    .subscribe((status) => {
      const isSubscribed = status === 'SUBSCRIBED';
      currentSyncStatus = {
        ...currentSyncStatus,
        isRealtimeActive: isSubscribed
      };
      notifyStatusChange();
    });
}

// Auto-trigger sync when returning online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    triggerFullSync();
    setupRealtimeSubscriptions();
  });
}

/**
 * Instant Single-Item Push to Supabase
 */
export async function pushSingleItem(item: ShoppingListItem): Promise<void> {
  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    await client.from('shopping_list_items').upsert({
      id: item.id,
      household_id: session.householdId,
      list_id: item.listId,
      product_id: item.productId || null,
      name: item.name,
      category: item.category,
      brand: item.brand || null,
      alternative_brands: item.alternativeBrands || [],
      selected_brand: item.selectedBrand || null,
      image_url: item.imageUrl || null,
      quantity: item.quantity,
      unit: item.unit,
      average_price: item.averagePrice || 0,
      last_price: item.lastPrice || 0,
      is_checked: item.isChecked,
      notes: item.notes || null,
      created_at: item.createdAt,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Falha ao enviar item para o Supabase:', err);
  }
}

/**
 * Instant Single-Item Delete from Supabase
 */
export async function deleteSingleItem(id: string): Promise<void> {
  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    await client.from('shopping_list_items').delete().eq('id', id);
  } catch (err) {
    console.warn('Falha ao deletar item no Supabase:', err);
  }
}

/**
 * Instant Bulk Delete from Supabase
 */
export async function deleteMultipleItems(ids: string[]): Promise<void> {
  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine || ids.length === 0) return;

  try {
    await client.from('shopping_list_items').delete().in('id', ids);
  } catch (err) {
    console.warn('Falha ao deletar itens no Supabase:', err);
  }
}

/**
 * Instant Single-List Push to Supabase
 */
export async function pushSingleList(list: ShoppingList): Promise<void> {
  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    await client.from('shopping_lists').upsert({
      id: list.id,
      household_id: session.householdId,
      title: list.title,
      is_default: list.isDefault,
      status: list.status,
      created_at: list.createdAt,
      updated_at: list.updatedAt
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Falha ao enviar lista para o Supabase:', err);
  }
}

/**
 * Instant Single-Reminder Push to Supabase
 */
export async function pushSingleReminder(reminder: Reminder): Promise<void> {
  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    await client.from('reminders').upsert({
      id: reminder.id,
      household_id: session.householdId,
      title: reminder.title,
      description: reminder.description || null,
      assigned_member_id: reminder.assignedMemberId || null,
      checklist: reminder.checklist || [],
      due_date: reminder.dueDate || null,
      is_completed: reminder.isCompleted,
      category: reminder.category || null,
      created_at: reminder.createdAt,
      updated_at: reminder.updatedAt
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Falha ao enviar lembrete para o Supabase:', err);
  }
}

/**
 * Instant Single-Reminder Delete from Supabase
 */
export async function deleteSingleReminder(id: string): Promise<void> {
  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    await client.from('reminders').delete().eq('id', id);
  } catch (err) {
    console.warn('Falha ao deletar lembrete no Supabase:', err);
  }
}

/**
 * Instant Single-Product Push to Supabase
 */
export async function pushSingleProduct(product: Product): Promise<void> {
  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    await client.from('products').upsert({
      id: product.id,
      household_id: session.householdId,
      name: product.name,
      category: product.category,
      brand: product.brand || null,
      alternative_brands: product.alternativeBrands || [],
      barcode: product.barcode || null,
      image_url: product.imageUrl || null,
      unit: product.unit,
      average_price: product.averagePrice || 0,
      last_price: product.lastPrice || 0,
      last_price_date: product.lastPriceDate || null,
      last_store: product.lastStore || null,
      purchase_count: product.purchaseCount || 0,
      created_at: product.createdAt,
      updated_at: product.updatedAt
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Falha ao enviar produto para o Supabase:', err);
  }
}

/**
 * Full JSON Data Backup & Export (100% Offline)
 */
export async function exportDatabaseToJson(): Promise<string> {
  const products = await db.products.toArray();
  const lists = await db.shoppingLists.toArray();
  const listItems = await db.shoppingListItems.toArray();
  const reminders = await db.reminders.toArray();
  const members = await db.householdMembers.toArray();
  const receipts = await db.receipts.toArray();
  const priceRecords = await db.priceRecords.toArray();

  const backup = {
    version: 1,
    exportDate: new Date().toISOString(),
    appName: 'OrganoCasa',
    data: {
      products,
      lists,
      listItems,
      reminders,
      members,
      receipts,
      priceRecords
    }
  };

  return JSON.stringify(backup, null, 2);
}

/**
 * Full JSON Data Restore & Import
 */
export async function importDatabaseFromJson(jsonString: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.data) throw new Error('Formato de backup inválido');

    const { products, lists, listItems, reminders, members, receipts, priceRecords } = parsed.data;

    await db.transaction(
      'rw',
      [
        db.products,
        db.shoppingLists,
        db.shoppingListItems,
        db.reminders,
        db.householdMembers,
        db.receipts,
        db.priceRecords
      ],
      async () => {
        if (products?.length) {
          await db.products.clear();
          await db.products.bulkAdd(products);
        }
        if (lists?.length) {
          await db.shoppingLists.clear();
          await db.shoppingLists.bulkAdd(lists);
        }
        if (listItems?.length) {
          await db.shoppingListItems.clear();
          await db.shoppingListItems.bulkAdd(listItems);
        }
        if (reminders?.length) {
          await db.reminders.clear();
          await db.reminders.bulkAdd(reminders);
        }
        if (members?.length) {
          await db.householdMembers.clear();
          await db.householdMembers.bulkAdd(members);
        }
        if (receipts?.length) {
          await db.receipts.clear();
          await db.receipts.bulkAdd(receipts);
        }
        if (priceRecords?.length) {
          await db.priceRecords.clear();
          await db.priceRecords.bulkAdd(priceRecords);
        }
      }
    );

    // If connected to Supabase, push the restored backup up
    await triggerFullSync();
    return true;
  } catch (error) {
    console.error('Erro ao importar backup JSON:', error);
    throw error;
  }
}
