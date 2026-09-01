import { db } from '../db/dexie';
import { clearSeedData } from '../db/seed';
import { getSupabaseClient } from './supabase';
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

// Local Cross-Tab Broadcast Channel
const localBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('organocasa_broadcast_sync')
  : null;

let syncStatusListeners: Array<(status: SyncStatus) => void> = [];
let currentSyncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncedAt: typeof localStorage !== 'undefined' ? localStorage.getItem('organocasa_last_synced_at') : null,
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
  if (typeof localStorage === 'undefined') return null;
  const data = localStorage.getItem('organocasa_user_session');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveCurrentSession(session: UserSession | null) {
  if (typeof localStorage === 'undefined') return;
  if (!session) {
    localStorage.removeItem('organocasa_user_session');
  } else {
    localStorage.setItem('organocasa_user_session', JSON.stringify(session));
  }
}

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
        created_by: userId,
        updated_at: new Date().toISOString()
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
        .maybeSingle();

      let householdId = memberData?.household_id;
      let householdObj = (memberData as any)?.households;
      let householdName = householdObj?.name || `Casa de ${cleanEmail.split('@')[0]}`;
      let inviteCode = householdObj?.invite_code || generateInviteCode();

      if (!householdId) {
        householdId = `house-${userId.substring(0, 8)}`;
        await client.from('households').upsert({
          id: householdId,
          name: householdName,
          invite_code: inviteCode,
          created_by: userId,
          updated_at: new Date().toISOString()
        });
        await client.from('household_members').upsert({
          id: `member-${userId.substring(0, 8)}`,
          household_id: householdId,
          user_id: userId,
          name: cleanEmail.split('@')[0],
          is_default: true
        });
      }

      const session: UserSession = {
        email: cleanEmail,
        id: userId,
        householdId,
        householdName,
        inviteCode
      };

      saveCurrentSession(session);

      // Clean local seed data and cache, then perform fresh pull from the account's household
      await clearSeedData();
      await pullFreshHouseholdData(householdId);
      setupRealtimeSubscriptions();
      return session;
    }
  }

  // Local Mock if Supabase is not configured
  await clearSeedData();
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
export async function joinHouseholdByCode(inviteCode: string, memberName?: string): Promise<UserSession> {
  const cleanCode = inviteCode.trim().toUpperCase();
  let current = getCurrentSession();

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

    const displayName = memberName?.trim() || (current ? current.email.split('@')[0] : 'Familiar Conectado');
    const userId = current ? current.id : `usr-${Math.random().toString(36).substring(2, 10)}`;
    const userEmail = current ? current.email : `${displayName.toLowerCase().replace(/\s+/g, '')}@familia.local`;

    // Associate member with this household in Supabase
    await client.from('household_members').upsert({
      id: `member-${userId.substring(0, 8)}-${household.id.substring(0, 6)}`,
      household_id: household.id,
      user_id: current?.id || null,
      name: displayName,
      is_default: false
    });

    const updatedSession: UserSession = {
      email: userEmail,
      id: userId,
      householdId: household.id,
      householdName: household.name,
      inviteCode: household.invite_code
    };

    saveCurrentSession(updatedSession);

    // CRITICAL: Clean seed items and replace local Dexie data with the joined household's real data
    await clearSeedData();
    await pullFreshHouseholdData(household.id);
    setupRealtimeSubscriptions();
    return updatedSession;
  }

  // Offline mock pairing
  await clearSeedData();
  const updatedSession: UserSession = {
    email: current ? current.email : 'familiar@local',
    id: current ? current.id : `usr-${Math.random().toString(36).substring(2, 10)}`,
    householdId: `house-${cleanCode}`,
    householdName: `Casa Conectada (${cleanCode})`,
    inviteCode: cleanCode
  };
  saveCurrentSession(updatedSession);
  return updatedSession;
}

/**
 * Fresh pull when switching households or logging into a new device
 */
async function pullFreshHouseholdData(householdId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !navigator.onLine) return;

  currentSyncStatus = { ...currentSyncStatus, isSyncing: true, errorMessage: null };
  notifyStatusChange();

  try {
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

    await db.transaction(
      'rw',
      [
        db.products,
        db.shoppingLists,
        db.shoppingListItems,
        db.reminders,
        db.receipts,
        db.priceRecords
      ],
      async () => {
        // Clear old local items so the joined household is clean
        if (remoteLists && remoteLists.length > 0) {
          await db.shoppingLists.clear();
          await db.shoppingListItems.clear();
        }
        if (remoteProducts && remoteProducts.length > 0) {
          await db.products.clear();
        }
        if (remoteReminders && remoteReminders.length > 0) {
          await db.reminders.clear();
        }

        // Add remote lists
        if (remoteLists?.length) {
          const lists: ShoppingList[] = remoteLists.map((l: any) => ({
            id: l.id,
            title: l.title,
            isDefault: Boolean(l.is_default),
            status: l.status || 'active',
            createdAt: l.created_at,
            updatedAt: l.updated_at || l.created_at
          }));
          await db.shoppingLists.bulkPut(lists);
        }

        // Add remote items
        if (remoteItems?.length) {
          const items: ShoppingListItem[] = remoteItems.map((i: any) => ({
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
            createdAt: i.created_at,
            updatedAt: i.updated_at || i.created_at
          }));
          await db.shoppingListItems.bulkPut(items);
        }

        // Add remote products
        if (remoteProducts?.length) {
          const products: Product[] = remoteProducts.map((p: any) => ({
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
            updatedAt: p.updated_at || p.created_at
          }));
          await db.products.bulkPut(products);
        }

        // Add remote reminders
        if (remoteReminders?.length) {
          const reminders: Reminder[] = remoteReminders.map((r: any) => ({
            id: r.id,
            title: r.title,
            description: r.description || undefined,
            assignedMemberId: r.assigned_member_id || undefined,
            checklist: r.checklist || [],
            dueDate: r.due_date || undefined,
            isCompleted: Boolean(r.is_completed),
            category: r.category || undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at || r.created_at
          }));
          await db.reminders.bulkPut(reminders);
        }

        // Add remote receipts
        if (remoteReceipts?.length) {
          const receipts: Receipt[] = remoteReceipts.map((rc: any) => ({
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
          await db.receipts.bulkPut(receipts);
        }

        // Add remote price records
        if (remotePriceRecords?.length) {
          const prices: PriceRecord[] = remotePriceRecords.map((pr: any) => ({
            id: pr.id,
            productId: pr.product_id,
            receiptId: pr.receipt_id || undefined,
            price: Number(pr.price || 0),
            quantity: Number(pr.quantity || 1),
            unit: pr.unit,
            storeName: pr.store_name,
            date: pr.date
          }));
          await db.priceRecords.bulkPut(prices);
        }
      }
    );

    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('organocasa_last_synced_at', now);
    currentSyncStatus = { isSyncing: false, lastSyncedAt: now, errorMessage: null, isRealtimeActive: true };
    notifyStatusChange();
  } catch (err: any) {
    console.error('Erro ao baixar dados da casa:', err);
    currentSyncStatus = { ...currentSyncStatus, isSyncing: false, errorMessage: err.message };
    notifyStatusChange();
  }
}

/**
 * Robust two-way merge synchronization with timestamp conflict resolution
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
    // STEP 1: PULL ALL REMOTE DATA FIRST
    // -------------------------------------------------------------
    const [
      { data: remoteProducts, error: prodErr },
      { data: remoteLists, error: listErr },
      { data: remoteItems, error: itemErr },
      { data: remoteReminders, error: remErr },
      { data: remoteReceipts, error: rcErr },
      { data: remotePriceRecords, error: prErr }
    ] = await Promise.all([
      client.from('products').select('*').eq('household_id', householdId),
      client.from('shopping_lists').select('*').eq('household_id', householdId),
      client.from('shopping_list_items').select('*').eq('household_id', householdId),
      client.from('reminders').select('*').eq('household_id', householdId),
      client.from('receipts').select('*').eq('household_id', householdId),
      client.from('price_records').select('*').eq('household_id', householdId)
    ]);

    if (prodErr || listErr || itemErr || remErr || rcErr || prErr) {
      const err = prodErr || listErr || itemErr || remErr || rcErr || prErr;
      throw new Error(`Erro ao consultar Supabase: ${err?.message}`);
    }

    const localProducts = await db.products.toArray();
    const localLists = await db.shoppingLists.toArray();
    const localItems = await db.shoppingListItems.toArray();
    const localReminders = await db.reminders.toArray();
    const localReceipts = await db.receipts.toArray();
    const localPriceRecords = await db.priceRecords.toArray();

    // -------------------------------------------------------------
    // STEP 2: MERGE REMOTE INTO LOCAL DEXIE (Remote Wins on Newer/Equal Timestamp)
    // -------------------------------------------------------------
    const remoteItemMap = new Map((remoteItems || []).map((i: any) => [i.id, i]));
    const remoteListMap = new Map((remoteLists || []).map((l: any) => [l.id, l]));
    const remoteRemMap = new Map((remoteReminders || []).map((r: any) => [r.id, r]));
    const remoteProdMap = new Map((remoteProducts || []).map((p: any) => [p.id, p]));

    // 2.1 Merge Shopping Lists
    for (const remoteList of remoteLists || []) {
      const local = localLists.find((l) => l.id === remoteList.id);
      const remoteUpdatedAt = new Date(remoteList.updated_at || remoteList.created_at).getTime();
      const localUpdatedAt = local ? new Date(local.updatedAt || local.createdAt).getTime() : 0;

      if (!local || remoteUpdatedAt >= localUpdatedAt) {
        await db.shoppingLists.put({
          id: remoteList.id,
          title: remoteList.title,
          isDefault: Boolean(remoteList.is_default),
          status: remoteList.status || 'active',
          createdAt: remoteList.created_at,
          updatedAt: remoteList.updated_at || remoteList.created_at
        });
      }
    }

    // 2.2 Merge Shopping List Items
    for (const remoteItem of remoteItems || []) {
      const local = localItems.find((i) => i.id === remoteItem.id);
      const remoteUpdatedAt = new Date(remoteItem.updated_at || remoteItem.created_at).getTime();
      const localUpdatedAt = local ? new Date(local.updatedAt || local.createdAt).getTime() : 0;

      if (!local || remoteUpdatedAt >= localUpdatedAt) {
        await db.shoppingListItems.put({
          id: remoteItem.id,
          listId: remoteItem.list_id,
          productId: remoteItem.product_id || undefined,
          name: remoteItem.name,
          category: remoteItem.category,
          brand: remoteItem.brand || undefined,
          alternativeBrands: remoteItem.alternative_brands || undefined,
          selectedBrand: remoteItem.selected_brand || undefined,
          imageUrl: remoteItem.image_url || undefined,
          quantity: Number(remoteItem.quantity || 1),
          unit: remoteItem.unit,
          averagePrice: Number(remoteItem.average_price || 0),
          lastPrice: Number(remoteItem.last_price || 0),
          isChecked: Boolean(remoteItem.is_checked),
          notes: remoteItem.notes || undefined,
          createdAt: remoteItem.created_at,
          updatedAt: remoteItem.updated_at || remoteItem.created_at
        });
      }
    }

    // Clean up local items that were deleted remotely (if remote had records)
    if (remoteItems && remoteItems.length > 0) {
      for (const local of localItems) {
        // If local item is not in remote and was created more than 1 minute ago, it was deleted on remote
        if (!remoteItemMap.has(local.id)) {
          const itemAgeMs = Date.now() - new Date(local.createdAt).getTime();
          if (itemAgeMs > 60000) {
            await db.shoppingListItems.delete(local.id);
          }
        }
      }
    }

    // 2.3 Merge Reminders
    for (const remoteRem of remoteReminders || []) {
      const local = localReminders.find((r) => r.id === remoteRem.id);
      const remoteUpdatedAt = new Date(remoteRem.updated_at || remoteRem.created_at).getTime();
      const localUpdatedAt = local ? new Date(local.updatedAt || local.createdAt).getTime() : 0;

      if (!local || remoteUpdatedAt >= localUpdatedAt) {
        await db.reminders.put({
          id: remoteRem.id,
          title: remoteRem.title,
          description: remoteRem.description || undefined,
          assignedMemberId: remoteRem.assigned_member_id || undefined,
          checklist: remoteRem.checklist || [],
          dueDate: remoteRem.due_date || undefined,
          isCompleted: Boolean(remoteRem.is_completed),
          category: remoteRem.category || undefined,
          createdAt: remoteRem.created_at,
          updatedAt: remoteRem.updated_at || remoteRem.created_at
        });
      }
    }

    if (remoteReminders && remoteReminders.length > 0) {
      for (const local of localReminders) {
        if (!remoteRemMap.has(local.id)) {
          const ageMs = Date.now() - new Date(local.createdAt).getTime();
          if (ageMs > 60000) {
            await db.reminders.delete(local.id);
          }
        }
      }
    }

    // 2.4 Merge Products & Price History
    for (const remoteProd of remoteProducts || []) {
      const local = localProducts.find((p) => p.id === remoteProd.id);
      const remoteUpdatedAt = new Date(remoteProd.updated_at || remoteProd.created_at).getTime();
      const localUpdatedAt = local ? new Date(local.updatedAt || local.createdAt).getTime() : 0;

      if (!local || remoteUpdatedAt >= localUpdatedAt) {
        await db.products.put({
          id: remoteProd.id,
          name: remoteProd.name,
          category: remoteProd.category,
          brand: remoteProd.brand || undefined,
          alternativeBrands: remoteProd.alternative_brands || undefined,
          barcode: remoteProd.barcode || undefined,
          imageUrl: remoteProd.image_url || undefined,
          unit: remoteProd.unit,
          averagePrice: Number(remoteProd.average_price || 0),
          lastPrice: Number(remoteProd.last_price || 0),
          lastPriceDate: remoteProd.last_price_date || undefined,
          lastStore: remoteProd.last_store || undefined,
          purchaseCount: Number(remoteProd.purchase_count || 0),
          createdAt: remoteProd.created_at,
          updatedAt: remoteProd.updated_at || remoteProd.created_at
        });
      }
    }

    // -------------------------------------------------------------
    // STEP 3: PUSH ONLY NEWER LOCAL MUTATIONS TO SUPABASE
    // -------------------------------------------------------------
    const updatedLocalItems = await db.shoppingListItems.toArray();
    const itemsToPush = updatedLocalItems.filter((local) => {
      // NEVER push seed / sample demo items to Supabase
      if (
        local.createdAt === '2020-01-01T00:00:00.000Z' ||
        local.id.startsWith('seed-') ||
        local.id.startsWith('item-1') ||
        local.id.startsWith('item-2') ||
        local.id.startsWith('item-3') ||
        local.id.startsWith('item-4') ||
        local.id.startsWith('item-5')
      ) {
        return false;
      }
      const remote = remoteItemMap.get(local.id);
      if (!remote) return true; // Newly created locally
      const localUpdatedAt = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at || remote.created_at).getTime();
      return localUpdatedAt > remoteUpdatedAt;
    });

    if (itemsToPush.length > 0) {
      const itemPayload = itemsToPush.map((i) => ({
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
        updated_at: i.updatedAt || new Date().toISOString()
      }));
      await client.from('shopping_list_items').upsert(itemPayload, { onConflict: 'id' });
    }

    const updatedLocalLists = await db.shoppingLists.toArray();
    const listsToPush = updatedLocalLists.filter((local) => {
      const remote = remoteListMap.get(local.id);
      if (!remote) return true;
      const localUpdatedAt = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at || remote.created_at).getTime();
      return localUpdatedAt > remoteUpdatedAt;
    });

    if (listsToPush.length > 0) {
      const listPayload = listsToPush.map((l) => ({
        id: l.id,
        household_id: householdId,
        title: l.title,
        is_default: l.isDefault,
        status: l.status,
        created_at: l.createdAt,
        updated_at: l.updatedAt || new Date().toISOString()
      }));
      await client.from('shopping_lists').upsert(listPayload, { onConflict: 'id' });
    }

    const updatedLocalReminders = await db.reminders.toArray();
    const remsToPush = updatedLocalReminders.filter((local) => {
      const remote = remoteRemMap.get(local.id);
      if (!remote) return true;
      const localUpdatedAt = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at || remote.created_at).getTime();
      return localUpdatedAt > remoteUpdatedAt;
    });

    if (remsToPush.length > 0) {
      const remPayload = remsToPush.map((r) => ({
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
        updated_at: r.updatedAt || new Date().toISOString()
      }));
      await client.from('reminders').upsert(remPayload, { onConflict: 'id' });
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

  // Listen to local BroadcastChannel for multi-tab sync
  if (localBroadcast) {
    localBroadcast.onmessage = async (event) => {
      const { type, entity, data, id } = event.data || {};
      if (type === 'ITEM_CHANGE' && data) {
        await db.shoppingListItems.put(data);
      } else if (type === 'ITEM_DELETE' && id) {
        await db.shoppingListItems.delete(id);
      } else if (type === 'REMINDER_CHANGE' && data) {
        await db.reminders.put(data);
      } else if (type === 'REMINDER_DELETE' && id) {
        await db.reminders.delete(id);
      } else if (type === 'LIST_CHANGE' && data) {
        await db.shoppingLists.put(data);
      }
    };
  }

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
            createdAt: item.created_at,
            updatedAt: item.updated_at || item.created_at
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
            updatedAt: list.updated_at || list.created_at
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
            updatedAt: rem.updated_at || rem.created_at
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
 * Instant Single-Item Push to Supabase & Local Broadcast
 */
export async function pushSingleItem(item: ShoppingListItem): Promise<void> {
  // Broadcast locally to other tabs
  localBroadcast?.postMessage({ type: 'ITEM_CHANGE', data: item });

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
      updated_at: item.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Falha ao enviar item para o Supabase:', err);
  }
}

/**
 * Instant Single-Item Delete from Supabase
 */
export async function deleteSingleItem(id: string): Promise<void> {
  localBroadcast?.postMessage({ type: 'ITEM_DELETE', id });

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
  ids.forEach((id) => localBroadcast?.postMessage({ type: 'ITEM_DELETE', id }));

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
  localBroadcast?.postMessage({ type: 'LIST_CHANGE', data: list });

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
      updated_at: list.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Falha ao enviar lista para o Supabase:', err);
  }
}

/**
 * Instant Single-Reminder Push to Supabase
 */
export async function pushSingleReminder(reminder: Reminder): Promise<void> {
  localBroadcast?.postMessage({ type: 'REMINDER_CHANGE', data: reminder });

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
      updated_at: reminder.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Falha ao enviar lembrete para o Supabase:', err);
  }
}

/**
 * Instant Single-Reminder Delete from Supabase
 */
export async function deleteSingleReminder(id: string): Promise<void> {
  localBroadcast?.postMessage({ type: 'REMINDER_DELETE', id });

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
      updated_at: product.updatedAt || new Date().toISOString()
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
