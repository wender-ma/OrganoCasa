import { db } from '../db/dexie';
import { clearSeedData } from '../db/seed';
import { getSupabaseClient } from './supabase';
import { getNotificationPreferences, sendLocalNotification } from './notifications';
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
  isOwner?: boolean;
}

export interface ConnectedHousehold {
  id: string;
  name: string;
  inviteCode?: string;
  isOwner: boolean;
  isCurrent: boolean;
  createdAt?: string;
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

// Deduplication of local mutations to avoid self-notifying on Realtime echo (TTL 60s)
const RECENT_ACTION_TTL_MS = 60_000;
const recentLocalActions = new Map<string, number>();

export function markRecentLocalAction(id: string, broadcast = true): void {
  if (!id) return;
  const now = Date.now();
  recentLocalActions.set(id, now);
  // Prune expired entries
  for (const [key, ts] of recentLocalActions.entries()) {
    if (now - ts > RECENT_ACTION_TTL_MS) {
      recentLocalActions.delete(key);
    }
  }
  if (broadcast) {
    localBroadcast?.postMessage({ type: 'LOCAL_ACTION', id });
  }
}

export function isRecentLocalAction(id: string): boolean {
  if (!id) return false;
  const ts = recentLocalActions.get(id);
  if (!ts) return false;
  if (Date.now() - ts > RECENT_ACTION_TTL_MS) {
    recentLocalActions.delete(id);
    return false;
  }
  return true;
}

// Exact seed IDs set (prevents prefix collision with user timestamp IDs)
const SEED_IDS = new Set([
  'item-1',
  'item-2',
  'item-3',
  'item-4',
  'item-5',
  'rem-1',
  'rem-2',
  'member-1',
  'member-2',
  'prod-arroz-5kg',
  'prod-feijao-1kg',
  'prod-leite-integral-1l',
  'prod-cafe-500g',
  'prod-azeite-500ml',
  'prod-banana-prata',
  'prod-ovos-30un',
  'prod-detergente-500ml',
  'hist-1',
  'hist-2',
  'hist-3',
  'hist-4',
  'hist-5',
  'hist-6',
  'hist-7',
  'hist-8',
  'hist-9',
  'hist-10',
  'hist-11',
  'hist-12',
  'hist-13',
  'hist-14',
  'hist-15',
  'hist-16'
]);

export function isSeedRecord(id: string, createdAt?: string): boolean {
  if (!id) return false;
  if (createdAt === '2020-01-01T00:00:00.000Z') return true;
  if (id.startsWith('seed-')) return true;
  return SEED_IDS.has(id);
}

// Registry of IDs confirmed on the remote server per household.
// Prevents offline-created items (>60s old) from being mistaken for remotely deleted items.
const memorySyncedIds = new Map<string, Set<string>>();

function getSyncedStorageKey(householdId: string): string {
  return `organocasa_synced_ids_${householdId}`;
}

export function getSyncedIds(householdId: string): Set<string> {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(getSyncedStorageKey(householdId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const set = new Set<string>(parsed);
          memorySyncedIds.set(householdId, set);
          return set;
        }
      }
    } catch {
      // Fallback to in-memory set
    }
  }
  let set = memorySyncedIds.get(householdId);
  if (!set) {
    set = new Set<string>();
    memorySyncedIds.set(householdId, set);
  }
  return set;
}

function saveSyncedIds(householdId: string, set: Set<string>): void {
  memorySyncedIds.set(householdId, set);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(getSyncedStorageKey(householdId), JSON.stringify(Array.from(set)));
    } catch {
      // Ignore quota errors
    }
  }
}

export function markIdsSynced(householdId: string, ids: string[]): void {
  if (!householdId || ids.length === 0) return;
  const set = getSyncedIds(householdId);
  ids.forEach((id) => {
    if (id) set.add(id);
  });
  saveSyncedIds(householdId, set);
}

export function unmarkIdsSynced(householdId: string, ids: string[]): void {
  if (!householdId || ids.length === 0) return;
  const set = getSyncedIds(householdId);
  ids.forEach((id) => set.delete(id));
  saveSyncedIds(householdId, set);
}

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

export function getSyncStatus(): SyncStatus {
  return { ...currentSyncStatus };
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

export function getSavedConnectedHouseholds(): ConnectedHousehold[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('organocasa_known_households');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConnectedHouseholds(list: ConnectedHousehold[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('organocasa_known_households', JSON.stringify(list));
}

export async function getConnectedHouseholds(): Promise<ConnectedHousehold[]> {
  const current = getCurrentSession();
  let localList = getSavedConnectedHouseholds();

  if (current) {
    const found = localList.find((h) => h.id === current.householdId);
    if (!found) {
      localList.push({
        id: current.householdId,
        name: current.householdName,
        inviteCode: current.inviteCode,
        isOwner: current.isOwner ?? true,
        isCurrent: true
      });
    } else {
      found.name = current.householdName;
      found.inviteCode = current.inviteCode || found.inviteCode;
      found.isOwner = current.isOwner ?? found.isOwner ?? true;
      found.isCurrent = true;
    }
  }

  // Ensure only current household has isCurrent: true
  localList = localList.map((h) => ({
    ...h,
    isCurrent: h.id === current?.householdId
  }));

  const client = getSupabaseClient();
  if (client && current?.id) {
    try {
      const { data: memberRows } = await client
        .from('household_members')
        .select('household_id, is_default, households(id, name, invite_code, created_by)')
        .eq('user_id', current.id);

      if (memberRows && memberRows.length > 0) {
        for (const row of memberRows) {
          const house: any = row.households;
          if (house) {
            const isOwner = !house.created_by || house.created_by === current.id;
            const existingIdx = localList.findIndex((h) => h.id === house.id);
            const item: ConnectedHousehold = {
              id: house.id,
              name: house.name,
              inviteCode: house.invite_code,
              isOwner,
              isCurrent: house.id === current.householdId
            };
            if (existingIdx >= 0) {
              localList[existingIdx] = { ...localList[existingIdx], ...item };
            } else {
              localList.push(item);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao sincronizar lista de casas:', err);
    }
  }

  saveConnectedHouseholds(localList);
  return localList;
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
      const currentGuestHousehold = getCurrentSession()?.householdId;

      let householdId = currentGuestHousehold || `house-${userId.substring(0, 8)}`;
      let householdName = getCurrentSession()?.householdName || `Casa de ${cleanEmail.split('@')[0]}`;
      let inviteCode = getCurrentSession()?.inviteCode || generateInviteCode();

      // Ensure the household row exists in Supabase before inserting household_members (avoids FK violation)
      const { data: existingHousehold } = await client
        .from('households')
        .select('id, name, invite_code')
        .eq('id', householdId)
        .maybeSingle();

      if (!existingHousehold) {
        await client.from('households').upsert({
          id: householdId,
          name: householdName,
          invite_code: inviteCode,
          created_by: userId,
          updated_at: new Date().toISOString()
        });
      } else {
        householdName = existingHousehold.name || householdName;
        inviteCode = existingHousehold.invite_code || inviteCode;
      }

      await client.from('household_members').upsert({
        id: `member-${userId.substring(0, 8)}-${householdId.substring(0, 6)}`,
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
        inviteCode,
        isOwner: true
      };

      saveCurrentSession(session);
      const known = getSavedConnectedHouseholds().map((h) => ({ ...h, isCurrent: false }));
      const existingIdx = known.findIndex((h) => h.id === householdId);
      const houseRecord: ConnectedHousehold = {
        id: householdId,
        name: householdName,
        inviteCode,
        isOwner: true,
        isCurrent: true
      };
      if (existingIdx >= 0) {
        known[existingIdx] = houseRecord;
      } else {
        known.push(houseRecord);
      }
      saveConnectedHouseholds(known);

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

      // Find all households the user is a member of, prioritizing is_default = true
      const { data: memberRows } = await client
        .from('household_members')
        .select('id, household_id, is_default, households(id, name, invite_code, created_by)')
        .eq('user_id', userId)
        .order('is_default', { ascending: false });

      const memberData = memberRows && memberRows.length > 0 ? memberRows[0] : null;

      let householdId = memberData?.household_id;
      let householdObj = (memberData as any)?.households;
      let householdName = householdObj?.name || `Casa de ${cleanEmail.split('@')[0]}`;
      let inviteCode = householdObj?.invite_code || generateInviteCode();
      const isOwner = !householdObj?.created_by || householdObj?.created_by === userId;

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
          id: `member-${userId.substring(0, 8)}-${householdId.substring(0, 6)}`,
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
        inviteCode,
        isOwner
      };

      saveCurrentSession(session);

      // Record known households from memberships
      const known: ConnectedHousehold[] = [];
      if (memberRows && memberRows.length > 0) {
        for (const row of memberRows) {
          const house: any = row.households;
          if (house) {
            known.push({
              id: house.id,
              name: house.name,
              inviteCode: house.invite_code,
              isOwner: !house.created_by || house.created_by === userId,
              isCurrent: house.id === householdId
            });
          }
        }
      }
      if (!known.some((h) => h.id === householdId)) {
        known.push({
          id: householdId,
          name: householdName,
          inviteCode,
          isOwner,
          isCurrent: true
        });
      }
      saveConnectedHouseholds(known);

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
  const session = getCurrentSession();
  if (client) {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    await client.auth.signOut().catch(console.error);
  }
  if (session?.householdId && typeof localStorage !== 'undefined') {
    localStorage.removeItem(getSyncedStorageKey(session.householdId));
    memorySyncedIds.delete(session.householdId);
  }
  saveCurrentSession(null);

  // Clear all local tables so app stays completely empty when logged out
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
      await db.products.clear();
      await db.shoppingLists.clear();
      await db.shoppingListItems.clear();
      await db.reminders.clear();
      await db.householdMembers.clear();
      await db.receipts.clear();
      await db.priceRecords.clear();
    }
  );

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
      .select('id, name, invite_code, created_by')
      .eq('invite_code', cleanCode)
      .single();

    if (error || !household) {
      throw new Error('Código de convite não encontrado ou inválido.');
    }

    const displayName = memberName?.trim() || (current ? current.email.split('@')[0] : 'Familiar Conectado');
    const userId = current ? current.id : `usr-${Math.random().toString(36).substring(2, 10)}`;
    const userEmail = current ? current.email : `${displayName.toLowerCase().replace(/\s+/g, '')}@familia.local`;
    const isOwner = household.created_by ? household.created_by === userId : false;

    // 1. If this is an authenticated user, mark their other household memberships as not default
    if (current?.id) {
      await client
        .from('household_members')
        .update({ is_default: false })
        .eq('user_id', current.id);
    }

    // 2. Associate / update member with this household in Supabase as default
    await client.from('household_members').upsert({
      id: `member-${userId.substring(0, 8)}-${household.id.substring(0, 6)}`,
      household_id: household.id,
      user_id: current?.id || null,
      name: displayName,
      is_default: true
    });

    const updatedSession: UserSession = {
      email: userEmail,
      id: userId,
      householdId: household.id,
      householdName: household.name,
      inviteCode: household.invite_code,
      isOwner
    };

    saveCurrentSession(updatedSession);

    // Record in known households list (maintaining previously connected houses!)
    const known = getSavedConnectedHouseholds().map((h) => ({ ...h, isCurrent: false }));
    const existingIdx = known.findIndex((h) => h.id === household.id);
    const houseRecord: ConnectedHousehold = {
      id: household.id,
      name: household.name,
      inviteCode: household.invite_code,
      isOwner,
      isCurrent: true
    };
    if (existingIdx >= 0) {
      known[existingIdx] = houseRecord;
    } else {
      known.push(houseRecord);
    }
    saveConnectedHouseholds(known);

    // Clean seed items and replace local Dexie data with the joined household's real data
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
    inviteCode: cleanCode,
    isOwner: false
  };
  saveCurrentSession(updatedSession);

  const known = getSavedConnectedHouseholds().map((h) => ({ ...h, isCurrent: false }));
  known.push({
    id: updatedSession.householdId,
    name: updatedSession.householdName,
    inviteCode: cleanCode,
    isOwner: false,
    isCurrent: true
  });
  saveConnectedHouseholds(known);

  return updatedSession;
}

/**
 * Switch active household seamlessly without losing data or membership
 */
export async function switchHousehold(targetHouseholdId: string): Promise<UserSession> {
  const current = getCurrentSession();
  if (!current) throw new Error('Nenhuma sessão ativa encontrada.');
  if (current.householdId === targetHouseholdId) return current;

  currentSyncStatus = { ...currentSyncStatus, isSyncing: true };
  notifyStatusChange();

  try {
    let targetHouse: { id: string; name: string; invite_code?: string; created_by?: string } | null = null;
    const client = getSupabaseClient();

    if (client) {
      const { data } = await client
        .from('households')
        .select('id, name, invite_code, created_by')
        .eq('id', targetHouseholdId)
        .maybeSingle();
      if (data) targetHouse = data;

      if (current.id) {
        await client
          .from('household_members')
          .update({ is_default: false })
          .eq('user_id', current.id);

        await client
          .from('household_members')
          .update({ is_default: true })
          .eq('user_id', current.id)
          .eq('household_id', targetHouseholdId);
      }
    }

    if (!targetHouse) {
      const known = getSavedConnectedHouseholds();
      const found = known.find((h) => h.id === targetHouseholdId);
      if (found) {
        targetHouse = {
          id: found.id,
          name: found.name,
          invite_code: found.inviteCode
        };
      }
    }

    if (!targetHouse) {
      throw new Error('Espaço familiar não encontrado.');
    }

    const isOwner = targetHouse.created_by ? targetHouse.created_by === current.id : current.isOwner ?? true;

    const newSession: UserSession = {
      ...current,
      householdId: targetHouse.id,
      householdName: targetHouse.name,
      inviteCode: targetHouse.invite_code || current.inviteCode,
      isOwner
    };

    saveCurrentSession(newSession);

    // Update known list isCurrent flag
    const known = getSavedConnectedHouseholds();
    const updatedKnown = known.map((h) => ({
      ...h,
      isCurrent: h.id === targetHouse!.id
    }));
    saveConnectedHouseholds(updatedKnown);

    // Clean local seed data and cache, then pull fresh data for this household
    await clearSeedData();
    await pullFreshHouseholdData(targetHouse.id);
    setupRealtimeSubscriptions();

    return newSession;
  } finally {
    currentSyncStatus = { ...currentSyncStatus, isSyncing: false };
    notifyStatusChange();
  }
}

/**
 * Create a new additional household in the user's hub
 */
export async function createAdditionalHousehold(name: string): Promise<UserSession> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('O nome da casa não pode ser vazio.');

  const current = getCurrentSession();
  const userId = current ? current.id : `usr-${Math.random().toString(36).substring(2, 10)}`;
  const userEmail = current ? current.email : 'usuario@local';
  const newHouseholdId = `house-${userId.substring(0, 8)}-${Date.now().toString(36)}`;
  const inviteCode = generateInviteCode();

  const client = getSupabaseClient();
  if (client) {
    const { error: houseErr } = await client.from('households').insert({
      id: newHouseholdId,
      name: cleanName,
      invite_code: inviteCode,
      created_by: current?.id || null,
      updated_at: new Date().toISOString()
    });
    if (houseErr) throw new Error(houseErr.message);

    if (current?.id) {
      await client
        .from('household_members')
        .update({ is_default: false })
        .eq('user_id', current.id);
    }

    await client.from('household_members').insert({
      id: `member-${userId.substring(0, 8)}-${newHouseholdId.substring(0, 6)}`,
      household_id: newHouseholdId,
      user_id: current?.id || null,
      name: current ? current.email.split('@')[0] : 'Eu',
      is_default: true
    });
  }

  const newSession: UserSession = {
    email: userEmail,
    id: userId,
    householdId: newHouseholdId,
    householdName: cleanName,
    inviteCode,
    isOwner: true
  };

  saveCurrentSession(newSession);

  const known = getSavedConnectedHouseholds().map((h) => ({ ...h, isCurrent: false }));
  known.push({
    id: newHouseholdId,
    name: cleanName,
    inviteCode,
    isOwner: true,
    isCurrent: true
  });
  saveConnectedHouseholds(known);

  await clearSeedData();
  await pullFreshHouseholdData(newHouseholdId);
  setupRealtimeSubscriptions();

  return newSession;
}

/**
 * Remove a member from the active household (Owner only permission)
 */
export async function removeHouseholdMember(memberId: string): Promise<void> {
  const current = getCurrentSession();
  if (!current) throw new Error('Sessão expirada.');

  const client = getSupabaseClient();
  if (client) {
    const { error } = await client
      .from('household_members')
      .delete()
      .eq('id', memberId)
      .eq('household_id', current.householdId);
    if (error) {
      console.warn('Erro ao remover membro no Supabase:', error.message);
    }
  }

  await db.householdMembers.delete(memberId);
  unmarkIdsSynced(current.householdId, [memberId]);
  localBroadcast?.postMessage({ type: 'MEMBER_DELETE', id: memberId });
  notifyStatusChange();
}

/**
 * Leave a connected household (disconnect self from a joined house)
 */
export async function leaveHousehold(householdId: string): Promise<UserSession | null> {
  const current = getCurrentSession();
  if (!current) return null;

  const client = getSupabaseClient();
  if (client && current.id) {
    await client
      .from('household_members')
      .delete()
      .eq('user_id', current.id)
      .eq('household_id', householdId);
  }

  let known = getSavedConnectedHouseholds().filter((h) => h.id !== householdId);
  saveConnectedHouseholds(known);

  if (current.householdId === householdId) {
    if (known.length > 0) {
      return await switchHousehold(known[0].id);
    } else {
      return await createAdditionalHousehold(`Casa de ${current.email.split('@')[0]}`);
    }
  }

  return current;
}

/**
 * Fresh pull when switching households or logging into a new device
 */
export async function pullFreshHouseholdData(householdId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !navigator.onLine) return;

  currentSyncStatus = { ...currentSyncStatus, isSyncing: true, errorMessage: null };
  notifyStatusChange();

  try {
    const [
      { data: remoteProducts, error: prodErr },
      { data: remoteLists, error: listErr },
      { data: remoteItems, error: itemErr },
      { data: remoteReminders, error: remErr },
      { data: remoteReceipts, error: rcErr },
      { data: remotePriceRecords, error: prErr },
      { data: remoteMembers, error: memErr },
      { data: remoteHouseData }
    ] = await Promise.all([
      client.from('products').select('*').eq('household_id', householdId),
      client.from('shopping_lists').select('*').eq('household_id', householdId),
      client.from('shopping_list_items').select('*').eq('household_id', householdId),
      client.from('reminders').select('*').eq('household_id', householdId),
      client.from('receipts').select('*').eq('household_id', householdId),
      client.from('price_records').select('*').eq('household_id', householdId),
      client.from('household_members').select('*').eq('household_id', householdId),
      client.from('households').select('id, name, created_by').eq('id', householdId).maybeSingle()
    ]);

    if (prodErr || listErr || itemErr || remErr || rcErr || prErr || memErr) {
      const err = prodErr || listErr || itemErr || remErr || rcErr || prErr || memErr;
      throw new Error(`Erro ao baixar dados da casa: ${err?.message}`);
    }

    const freshSyncedIds = new Set<string>();

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
        // Always clear all local tables so switching households leaves no stale data behind
        await db.products.clear();
        await db.shoppingLists.clear();
        await db.shoppingListItems.clear();
        await db.reminders.clear();
        await db.householdMembers.clear();
        await db.receipts.clear();
        await db.priceRecords.clear();

        // Add remote lists
        if (remoteLists?.length) {
          const lists: ShoppingList[] = remoteLists.map((l: any) => {
            freshSyncedIds.add(l.id);
            return {
              id: l.id,
              title: l.title,
              isDefault: Boolean(l.is_default),
              status: l.status || 'active',
              createdAt: l.created_at,
              updatedAt: l.updated_at || l.created_at
            };
          });
          await db.shoppingLists.bulkPut(lists);
        }

        // Add remote items
        if (remoteItems?.length) {
          const items: ShoppingListItem[] = remoteItems.map((i: any) => {
            freshSyncedIds.add(i.id);
            return {
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
            };
          });
          await db.shoppingListItems.bulkPut(items);
        }

        // Add remote products
        if (remoteProducts?.length) {
          const products: Product[] = remoteProducts.map((p: any) => {
            freshSyncedIds.add(p.id);
            return {
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
            };
          });
          await db.products.bulkPut(products);
        }

        // Add remote reminders
        if (remoteReminders?.length) {
          const reminders: Reminder[] = remoteReminders.map((r: any) => {
            freshSyncedIds.add(r.id);
            return {
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
            };
          });
          await db.reminders.bulkPut(reminders);
        }

        // Add remote receipts
        if (remoteReceipts?.length) {
          const receipts: Receipt[] = remoteReceipts.map((rc: any) => {
            freshSyncedIds.add(rc.id);
            return {
              id: rc.id,
              listId: rc.list_id || undefined,
              storeName: rc.store_name,
              accessKey: rc.access_key || undefined,
              totalAmount: Number(rc.total_amount || 0),
              purchaseDate: rc.purchase_date,
              rawType: rc.raw_type || 'qr_code',
              items: rc.items || [],
              createdAt: rc.created_at
            };
          });
          await db.receipts.bulkPut(receipts);
        }

        // Add remote price records
        if (remotePriceRecords?.length) {
          const prices: PriceRecord[] = remotePriceRecords.map((pr: any) => {
            freshSyncedIds.add(pr.id);
            return {
              id: pr.id,
              productId: pr.product_id,
              receiptId: pr.receipt_id || undefined,
              price: Number(pr.price || 0),
              quantity: Number(pr.quantity || 1),
              unit: pr.unit,
              storeName: pr.store_name,
              date: pr.date
            };
          });
          await db.priceRecords.bulkPut(prices);
        }

        // Add remote household members (purging legacy mock seed members)
        if (remoteMembers?.length) {
          const houseCreatorId = remoteHouseData?.created_by;
          const currentSession = getCurrentSession();

          // Auto-purge any legacy seed members from Supabase for this household
          if (client) {
            client
              .from('household_members')
              .delete()
              .in('id', ['member-1', 'member-2'])
              .eq('household_id', householdId)
              .then(() => {}, () => {});
          }

          const members: HouseholdMember[] = remoteMembers
            .filter((m: any) => !isSeedRecord(m.id) && m.id !== 'member-1' && m.id !== 'member-2' && m.name !== 'Esposa / Parceiro(a)')
            .map((m: any) => {
              freshSyncedIds.add(m.id);
              // Only the true household creator is 'owner', all other family participants are 'member'
              const isOwner = Boolean(
                houseCreatorId
                  ? m.user_id === houseCreatorId
                  : (currentSession && (m.user_id === currentSession.id || m.name?.toLowerCase() === currentSession.email.split('@')[0].toLowerCase()))
              );

              return {
                id: m.id,
                name: m.name,
                color: m.color || '#10b981',
                avatarEmoji: m.avatar_emoji || '👤',
                isDefault: Boolean(m.is_default),
                userId: m.user_id || undefined,
                role: isOwner ? 'owner' : 'member',
                createdAt: m.created_at
              };
            });
          await db.householdMembers.bulkPut(members);
          await db.householdMembers.bulkDelete(['member-1', 'member-2']);
        }
      }
    );

    saveSyncedIds(householdId, freshSyncedIds);

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
      { data: remotePriceRecords, error: prErr },
      { data: remoteMembers, error: memErr },
      { data: remoteHouseData }
    ] = await Promise.all([
      client.from('products').select('*').eq('household_id', householdId),
      client.from('shopping_lists').select('*').eq('household_id', householdId),
      client.from('shopping_list_items').select('*').eq('household_id', householdId),
      client.from('reminders').select('*').eq('household_id', householdId),
      client.from('receipts').select('*').eq('household_id', householdId),
      client.from('price_records').select('*').eq('household_id', householdId),
      client.from('household_members').select('*').eq('household_id', householdId),
      client.from('households').select('id, name, created_by').eq('id', householdId).maybeSingle()
    ]);

    if (prodErr || listErr || itemErr || remErr || rcErr || prErr || memErr) {
      const err = prodErr || listErr || itemErr || remErr || rcErr || prErr || memErr;
      throw new Error(`Erro ao consultar Supabase: ${err?.message}`);
    }

    const localProducts = await db.products.toArray();
    const localLists = await db.shoppingLists.toArray();
    const localItems = await db.shoppingListItems.toArray();
    const localReminders = await db.reminders.toArray();
    const localReceipts = await db.receipts.toArray();
    const localPriceRecords = await db.priceRecords.toArray();
    const localMembers = await db.householdMembers.toArray();

    const syncedIds = getSyncedIds(householdId);

    // -------------------------------------------------------------
    // STEP 2: MERGE REMOTE INTO LOCAL DEXIE (Remote Wins on Newer/Equal Timestamp)
    // -------------------------------------------------------------
    const remoteItemMap = new Map((remoteItems || []).map((i: any) => [i.id, i]));
    const remoteListMap = new Map((remoteLists || []).map((l: any) => [l.id, l]));
    const remoteRemMap = new Map((remoteReminders || []).map((r: any) => [r.id, r]));
    const remoteProdMap = new Map((remoteProducts || []).map((p: any) => [p.id, p]));
    const remoteReceiptMap = new Map((remoteReceipts || []).map((rc: any) => [rc.id, rc]));
    const remotePriceMap = new Map((remotePriceRecords || []).map((pr: any) => [pr.id, pr]));
    const remoteMemberMap = new Map((remoteMembers || []).map((m: any) => [m.id, m]));

    // 2.1 Merge Shopping Lists
    for (const remoteList of remoteLists || []) {
      syncedIds.add(remoteList.id);
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

    for (const local of localLists) {
      if (!remoteListMap.has(local.id) && syncedIds.has(local.id) && !isRecentLocalAction(local.id)) {
        await db.shoppingLists.delete(local.id);
        syncedIds.delete(local.id);
      }
    }

    // 2.2 Merge Shopping List Items
    for (const remoteItem of remoteItems || []) {
      syncedIds.add(remoteItem.id);
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

    // Clean up local items that were previously synced to remote and subsequently deleted on remote.
    // Items created offline (not in syncedIds) are NEVER deleted here, regardless of how long offline lasted.
    for (const local of localItems) {
      if (!remoteItemMap.has(local.id) && syncedIds.has(local.id) && !isRecentLocalAction(local.id)) {
        await db.shoppingListItems.delete(local.id);
        syncedIds.delete(local.id);
      }
    }

    // 2.3 Merge Reminders
    for (const remoteRem of remoteReminders || []) {
      syncedIds.add(remoteRem.id);
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

    // Clean up local reminders that were previously synced and subsequently deleted remotely
    for (const local of localReminders) {
      if (!remoteRemMap.has(local.id) && syncedIds.has(local.id) && !isRecentLocalAction(local.id)) {
        await db.reminders.delete(local.id);
        syncedIds.delete(local.id);
      }
    }

    // 2.4 Merge Products
    for (const remoteProd of remoteProducts || []) {
      syncedIds.add(remoteProd.id);
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

    for (const local of localProducts) {
      if (!remoteProdMap.has(local.id) && syncedIds.has(local.id) && !isRecentLocalAction(local.id)) {
        await db.products.delete(local.id);
        syncedIds.delete(local.id);
      }
    }

    // 2.5 Merge Receipts
    for (const remoteRc of remoteReceipts || []) {
      syncedIds.add(remoteRc.id);
      const local = localReceipts.find((rc) => rc.id === remoteRc.id);
      if (!local || !isRecentLocalAction(remoteRc.id)) {
        await db.receipts.put({
          id: remoteRc.id,
          listId: remoteRc.list_id || undefined,
          storeName: remoteRc.store_name,
          accessKey: remoteRc.access_key || undefined,
          totalAmount: Number(remoteRc.total_amount || 0),
          purchaseDate: remoteRc.purchase_date,
          rawType: remoteRc.raw_type || 'qr_code',
          items: remoteRc.items || [],
          createdAt: remoteRc.created_at
        });
      }
    }

    for (const local of localReceipts) {
      if (!remoteReceiptMap.has(local.id) && syncedIds.has(local.id) && !isRecentLocalAction(local.id)) {
        await db.receipts.delete(local.id);
        syncedIds.delete(local.id);
      }
    }

    // 2.6 Merge Price Records
    for (const remotePr of remotePriceRecords || []) {
      syncedIds.add(remotePr.id);
      const local = localPriceRecords.find((pr) => pr.id === remotePr.id);
      if (!local) {
        await db.priceRecords.put({
          id: remotePr.id,
          productId: remotePr.product_id,
          receiptId: remotePr.receipt_id || undefined,
          price: Number(remotePr.price || 0),
          quantity: Number(remotePr.quantity || 1),
          unit: remotePr.unit,
          storeName: remotePr.store_name,
          date: remotePr.date
        });
      }
    }

    for (const local of localPriceRecords) {
      if (!remotePriceMap.has(local.id) && syncedIds.has(local.id) && !isRecentLocalAction(local.id)) {
        await db.priceRecords.delete(local.id);
        syncedIds.delete(local.id);
      }
    }

    // 2.7 Merge Household Members (ignoring any mock seed members)
    for (const remoteMem of remoteMembers || []) {
      if (isSeedRecord(remoteMem.id) || remoteMem.id === 'member-1' || remoteMem.id === 'member-2') {
        continue;
      }
      syncedIds.add(remoteMem.id);
      const local = localMembers.find((m) => m.id === remoteMem.id);
      if (!local || !isRecentLocalAction(remoteMem.id)) {
        const isOwner = Boolean(
          session && (remoteMem.user_id === session.id || remoteMem.name?.toLowerCase() === session.email.split('@')[0].toLowerCase())
        );
        await db.householdMembers.put({
          id: remoteMem.id,
          name: remoteMem.name,
          color: remoteMem.color || '#10b981',
          avatarEmoji: remoteMem.avatar_emoji || '👤',
          isDefault: Boolean(remoteMem.is_default),
          userId: remoteMem.user_id || undefined,
          role: isOwner ? 'owner' : 'member',
          createdAt: remoteMem.created_at
        });
      }
    }

    await db.householdMembers.bulkDelete(['member-1', 'member-2']);

    for (const local of localMembers) {
      if (isSeedRecord(local.id) || local.id === 'member-1' || local.id === 'member-2') {
        await db.householdMembers.delete(local.id);
        continue;
      }
      if (!remoteMemberMap.has(local.id) && syncedIds.has(local.id) && !isRecentLocalAction(local.id)) {
        await db.householdMembers.delete(local.id);
        syncedIds.delete(local.id);
      }
    }

    // -------------------------------------------------------------
    // STEP 3: PUSH ONLY NEWER LOCAL MUTATIONS TO SUPABASE
    // Order respects PostgreSQL foreign keys:
    // 1. shopping_lists -> 2. products -> 3. shopping_list_items
    // -> 4. reminders -> 5. receipts -> 6. price_records -> 7. household_members
    // -------------------------------------------------------------
    const updatedLocalItems = await db.shoppingListItems.toArray();
    const itemsToPush = updatedLocalItems.filter((local) => {
      if (isSeedRecord(local.id, local.createdAt)) {
        return false;
      }
      const remote = remoteItemMap.get(local.id);
      if (!remote) return true; // Newly created locally
      const localUpdatedAt = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at || remote.created_at).getTime();
      return localUpdatedAt > remoteUpdatedAt;
    });

    // Ensure every list referenced by itemsToPush exists in db.shoppingLists
    let updatedLocalLists = await db.shoppingLists.toArray();
    const localListIds = new Set(updatedLocalLists.map((l) => l.id));
    for (const item of itemsToPush) {
      if (item.listId && !localListIds.has(item.listId) && !remoteListMap.has(item.listId)) {
        const fallbackList: ShoppingList = {
          id: item.listId,
          title: 'Compras da Semana',
          isDefault: updatedLocalLists.length === 0,
          status: 'active',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await db.shoppingLists.put(fallbackList);
        updatedLocalLists.push(fallbackList);
        localListIds.add(fallbackList.id);
      }
    }

    // 3.1 Push Shopping Lists FIRST (required by shopping_list_items.list_id FK)
    const listsToPush = updatedLocalLists.filter((local) => {
      if (isSeedRecord(local.id, local.createdAt)) return false;
      const remote = remoteListMap.get(local.id);
      if (!remote) return true;
      const localUpdatedAt = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at || remote.created_at).getTime();
      return localUpdatedAt > remoteUpdatedAt;
    });

    if (listsToPush.length > 0) {
      listsToPush.forEach((l) => markRecentLocalAction(l.id));
      const listPayload = listsToPush.map((l) => ({
        id: l.id,
        household_id: householdId,
        title: l.title,
        is_default: l.isDefault,
        status: l.status,
        created_at: l.createdAt,
        updated_at: l.updatedAt || new Date().toISOString()
      }));
      const { error: pushListErr } = await client.from('shopping_lists').upsert(listPayload, { onConflict: 'id' });
      if (!pushListErr) {
        listsToPush.forEach((l) => syncedIds.add(l.id));
      }
    }

    // 3.2 Push Products SECOND (required by price_records.product_id FK)
    const updatedLocalProducts = await db.products.toArray();
    const productsToPush = updatedLocalProducts.filter((local) => {
      if (isSeedRecord(local.id, local.createdAt)) return false;
      const remote = remoteProdMap.get(local.id);
      if (!remote) return true;
      const localUpdatedAt = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at || remote.created_at).getTime();
      return localUpdatedAt > remoteUpdatedAt;
    });

    if (productsToPush.length > 0) {
      productsToPush.forEach((p) => markRecentLocalAction(p.id));
      const prodPayload = productsToPush.map((p) => ({
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
        updated_at: p.updatedAt || new Date().toISOString()
      }));
      const { error: pushProdErr } = await client.from('products').upsert(prodPayload, { onConflict: 'id' });
      if (!pushProdErr) {
        productsToPush.forEach((p) => syncedIds.add(p.id));
      }
    }

    // 3.3 Push Shopping List Items THIRD
    if (itemsToPush.length > 0) {
      itemsToPush.forEach((i) => markRecentLocalAction(i.id));
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
      const { error: pushItemErr } = await client.from('shopping_list_items').upsert(itemPayload, { onConflict: 'id' });
      if (!pushItemErr) {
        itemsToPush.forEach((i) => syncedIds.add(i.id));
      }
    }

    // 3.4 Push Reminders FOURTH
    const updatedLocalReminders = await db.reminders.toArray();
    const remsToPush = updatedLocalReminders.filter((local) => {
      if (isSeedRecord(local.id, local.createdAt)) return false;
      const remote = remoteRemMap.get(local.id);
      if (!remote) return true;
      const localUpdatedAt = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at || remote.created_at).getTime();
      return localUpdatedAt > remoteUpdatedAt;
    });

    if (remsToPush.length > 0) {
      remsToPush.forEach((r) => markRecentLocalAction(r.id));
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
      const { error: pushRemErr } = await client.from('reminders').upsert(remPayload, { onConflict: 'id' });
      if (!pushRemErr) {
        remsToPush.forEach((r) => syncedIds.add(r.id));
      }
    }

    // 3.5 Push Receipts FIFTH
    const updatedLocalReceipts = await db.receipts.toArray();
    const receiptsToPush = updatedLocalReceipts.filter((local) => {
      if (isSeedRecord(local.id, local.createdAt)) return false;
      const remote = remoteReceiptMap.get(local.id);
      if (!remote) return true;
      return isRecentLocalAction(local.id);
    });

    if (receiptsToPush.length > 0) {
      receiptsToPush.forEach((rc) => markRecentLocalAction(rc.id));
      const rcPayload = receiptsToPush.map((rc) => ({
        id: rc.id,
        household_id: householdId,
        list_id: rc.listId || null,
        store_name: rc.storeName,
        access_key: rc.accessKey || null,
        total_amount: rc.totalAmount || 0,
        purchase_date: rc.purchaseDate,
        raw_type: rc.rawType || 'qr_code',
        items: rc.items || [],
        created_at: rc.createdAt
      }));
      const { error: pushRcErr } = await client.from('receipts').upsert(rcPayload, { onConflict: 'id' });
      if (!pushRcErr) {
        receiptsToPush.forEach((rc) => syncedIds.add(rc.id));
      }
    }

    // 3.6 Push Price Records SIXTH
    const validProductIds = new Set([
      ...updatedLocalProducts.map((p) => p.id),
      ...Array.from(remoteProdMap.keys())
    ]);
    const updatedLocalPriceRecords = await db.priceRecords.toArray();
    const pricesToPush = updatedLocalPriceRecords.filter((local) => {
      if (isSeedRecord(local.id, local.date)) return false;
      if (!validProductIds.has(local.productId)) return false;
      return !remotePriceMap.has(local.id);
    });

    if (pricesToPush.length > 0) {
      const prPayload = pricesToPush.map((pr) => ({
        id: pr.id,
        household_id: householdId,
        product_id: pr.productId,
        receipt_id: pr.receiptId || null,
        price: pr.price,
        quantity: pr.quantity,
        unit: pr.unit,
        store_name: pr.storeName,
        date: pr.date
      }));
      const { error: pushPrErr } = await client.from('price_records').upsert(prPayload, { onConflict: 'id' });
      if (!pushPrErr) {
        pricesToPush.forEach((pr) => syncedIds.add(pr.id));
      }
    }

    // 3.7 Push Household Members SEVENTH
    const updatedLocalMembers = await db.householdMembers.toArray();
    const membersToPush = updatedLocalMembers.filter((local) => {
      if (isSeedRecord(local.id) || local.id === 'member-1' || local.id === 'member-2') return false;
      const remote = remoteMemberMap.get(local.id);
      if (!remote) return true;
      if (isRecentLocalAction(local.id)) return true;
      return (
        remote.name !== local.name ||
        remote.color !== local.color ||
        remote.avatar_emoji !== local.avatarEmoji ||
        Boolean(remote.is_default) !== Boolean(local.isDefault)
      );
    });

    if (membersToPush.length > 0) {
      const memPayload = membersToPush.map((m) => ({
        id: m.id,
        household_id: householdId,
        name: m.name,
        color: m.color || '#10b981',
        avatar_emoji: m.avatarEmoji || '👤',
        is_default: Boolean(m.isDefault)
      }));
      const { error: pushMemErr } = await client.from('household_members').upsert(memPayload, { onConflict: 'id' });
      if (!pushMemErr) {
        membersToPush.forEach((m) => syncedIds.add(m.id));
      }
    }

    saveSyncedIds(householdId, syncedIds);

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
 * & Shared Household Notifications (v1.4.1)
 */
let realtimeChannel: any = null;

export function setupRealtimeSubscriptions(): void {
  const client = getSupabaseClient();
  const session = getCurrentSession();

  // Listen to local BroadcastChannel for multi-tab sync
  if (localBroadcast) {
    localBroadcast.onmessage = async (event) => {
      const { type, data, id } = event.data || {};
      if (type === 'LOCAL_ACTION' && id) {
        markRecentLocalAction(id, false);
      } else if (type === 'ITEM_CHANGE' && data) {
        await db.shoppingListItems.put(data);
      } else if (type === 'ITEM_DELETE' && id) {
        await db.shoppingListItems.delete(id);
      } else if (type === 'REMINDER_CHANGE' && data) {
        await db.reminders.put(data);
      } else if (type === 'REMINDER_DELETE' && id) {
        await db.reminders.delete(id);
      } else if (type === 'LIST_CHANGE' && data) {
        await db.shoppingLists.put(data);
      } else if (type === 'RECEIPT_CHANGE' && data) {
        await db.receipts.put(data);
      } else if (type === 'RECEIPT_DELETE' && id) {
        await db.receipts.delete(id);
      } else if (type === 'PRODUCT_CHANGE' && data) {
        await db.products.put(data);
      } else if (type === 'PRODUCT_DELETE' && id) {
        await db.products.delete(id);
      } else if (type === 'MEMBER_CHANGE' && data) {
        await db.householdMembers.put(data);
        notifyStatusChange();
      } else if (type === 'MEMBER_DELETE' && id) {
        await db.householdMembers.delete(id);
        notifyStatusChange();
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
          const existingLocal = await db.shoppingListItems.get(item.id);
          markIdsSynced(householdId, [item.id]);

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

          // Shared Household Notification (only if triggered by another device)
          if (!isRecentLocalAction(item.id)) {
            const prefs = getNotificationPreferences();
            if (prefs.listSharedAlerts) {
              if (payload.eventType === 'INSERT' && !existingLocal && !item.is_checked) {
                sendLocalNotification('🛒 Novo item na lista!', {
                  body: `"${item.name}" foi adicionado à lista de compras.`,
                  tag: `item-add-${item.id}`
                }).catch(console.warn);
              } else if (
                payload.eventType === 'UPDATE' &&
                Boolean(item.is_checked) &&
                (!existingLocal || !existingLocal.isChecked)
              ) {
                sendLocalNotification('✅ Item comprado!', {
                  body: `"${item.name}" foi marcado como comprado.`,
                  tag: `item-check-${item.id}`
                }).catch(console.warn);
              }
            }
          }
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            unmarkIdsSynced(householdId, [payload.old.id]);
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
          markIdsSynced(householdId, [list.id]);
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
            unmarkIdsSynced(householdId, [payload.old.id]);
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
          const existingRem = await db.reminders.get(rem.id);
          markIdsSynced(householdId, [rem.id]);

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

          if (!isRecentLocalAction(rem.id)) {
            const prefs = getNotificationPreferences();
            if (prefs.reminderAlerts) {
              if (payload.eventType === 'INSERT' && !existingRem) {
                sendLocalNotification('📌 Novo lembrete na casa!', {
                  body: `"${rem.title}" foi adicionado aos lembretes.`,
                  tag: `rem-add-${rem.id}`
                }).catch(console.warn);
              } else if (
                payload.eventType === 'UPDATE' &&
                Boolean(rem.is_completed) &&
                (!existingRem || !existingRem.isCompleted)
              ) {
                sendLocalNotification('✅ Tarefa concluída!', {
                  body: `"${rem.title}" foi marcada como concluída.`,
                  tag: `rem-done-${rem.id}`
                }).catch(console.warn);
              }
            }
          }
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            unmarkIdsSynced(householdId, [payload.old.id]);
            await db.reminders.delete(payload.old.id);
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'receipts',
        filter: `household_id=eq.${householdId}`
      },
      async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rc = payload.new as any;
          const existingRc = await db.receipts.get(rc.id);
          markIdsSynced(householdId, [rc.id]);

          await db.receipts.put({
            id: rc.id,
            listId: rc.list_id || undefined,
            storeName: rc.store_name,
            accessKey: rc.access_key || undefined,
            totalAmount: Number(rc.total_amount || 0),
            purchaseDate: rc.purchase_date,
            rawType: rc.raw_type || 'qr_code',
            items: rc.items || [],
            createdAt: rc.created_at
          });

          if (payload.eventType === 'INSERT' && !existingRc && !isRecentLocalAction(rc.id)) {
            const prefs = getNotificationPreferences();
            if (prefs.listSharedAlerts) {
              const totalFormatted = Number(rc.total_amount || 0).toFixed(2);
              const loja = rc.store_name || 'Supermercado';
              sendLocalNotification('🧾 Nova compra na casa!', {
                body: `Compra de R$ ${totalFormatted} registrada no ${loja}.`,
                tag: `receipt-${rc.id}`
              }).catch(console.warn);
            }
          }
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            unmarkIdsSynced(householdId, [payload.old.id]);
            await db.receipts.delete(payload.old.id);
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `household_id=eq.${householdId}`
      },
      async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const p = payload.new as any;
          markIdsSynced(householdId, [p.id]);
          await db.products.put({
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
          });
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            unmarkIdsSynced(householdId, [payload.old.id]);
            await db.products.delete(payload.old.id);
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'household_members',
        filter: `household_id=eq.${householdId}`
      },
      async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const m = payload.new as any;
          if (isSeedRecord(m.id) || m.id === 'member-1' || m.id === 'member-2') return;
          markIdsSynced(householdId, [m.id]);
          const isOwner = Boolean(
            session && (m.user_id === session.id || m.name?.toLowerCase() === session.email.split('@')[0].toLowerCase())
          );
          await db.householdMembers.put({
            id: m.id,
            name: m.name,
            color: m.color || '#10b981',
            avatarEmoji: m.avatar_emoji || '👤',
            isDefault: Boolean(m.is_default),
            userId: m.user_id || undefined,
            role: isOwner ? 'owner' : 'member',
            createdAt: m.created_at
          });
          notifyStatusChange();
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            unmarkIdsSynced(householdId, [payload.old.id]);
            await db.householdMembers.delete(payload.old.id);
            notifyStatusChange();
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
  markRecentLocalAction(item.id);
  localBroadcast?.postMessage({ type: 'ITEM_CHANGE', data: item });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    // Ensure parent shopping list and product exist on remote if not yet synced
    const synced = getSyncedIds(session.householdId);
    if (item.listId && !synced.has(item.listId)) {
      const localList = await db.shoppingLists.get(item.listId);
      if (localList) {
        await pushSingleList(localList);
      }
    }
    if (item.productId && !synced.has(item.productId)) {
      const localProduct = await db.products.get(item.productId);
      if (localProduct) {
        await pushSingleProduct(localProduct);
      }
    }

    const { error } = await client.from('shopping_list_items').upsert({
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

    if (!error) {
      markIdsSynced(session.householdId, [item.id]);
    }
  } catch (err) {
    console.warn('Falha ao enviar item para o Supabase:', err);
  }
}

/**
 * Instant Single-Item Delete from Supabase
 */
export async function deleteSingleItem(id: string): Promise<void> {
  markRecentLocalAction(id);
  localBroadcast?.postMessage({ type: 'ITEM_DELETE', id });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('shopping_list_items').delete().eq('id', id);
    if (!error) {
      unmarkIdsSynced(session.householdId, [id]);
    }
  } catch (err) {
    console.warn('Falha ao deletar item no Supabase:', err);
  }
}

/**
 * Instant Bulk Delete from Supabase
 */
export async function deleteMultipleItems(ids: string[]): Promise<void> {
  ids.forEach((id) => {
    markRecentLocalAction(id);
    localBroadcast?.postMessage({ type: 'ITEM_DELETE', id });
  });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine || ids.length === 0) return;

  try {
    const { error } = await client.from('shopping_list_items').delete().in('id', ids);
    if (!error) {
      unmarkIdsSynced(session.householdId, ids);
    }
  } catch (err) {
    console.warn('Falha ao deletar itens no Supabase:', err);
  }
}

/**
 * Instant Single-List Push to Supabase
 */
export async function pushSingleList(list: ShoppingList): Promise<void> {
  markRecentLocalAction(list.id);
  localBroadcast?.postMessage({ type: 'LIST_CHANGE', data: list });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('shopping_lists').upsert({
      id: list.id,
      household_id: session.householdId,
      title: list.title,
      is_default: list.isDefault,
      status: list.status,
      created_at: list.createdAt,
      updated_at: list.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });

    if (!error) {
      markIdsSynced(session.householdId, [list.id]);
    }
  } catch (err) {
    console.warn('Falha ao enviar lista para o Supabase:', err);
  }
}

/**
 * Instant Single-Reminder Push to Supabase
 */
export async function pushSingleReminder(reminder: Reminder): Promise<void> {
  markRecentLocalAction(reminder.id);
  localBroadcast?.postMessage({ type: 'REMINDER_CHANGE', data: reminder });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('reminders').upsert({
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

    if (!error) {
      markIdsSynced(session.householdId, [reminder.id]);
    }
  } catch (err) {
    console.warn('Falha ao enviar lembrete para o Supabase:', err);
  }
}

/**
 * Instant Single-Reminder Delete from Supabase
 */
export async function deleteSingleReminder(id: string): Promise<void> {
  markRecentLocalAction(id);
  localBroadcast?.postMessage({ type: 'REMINDER_DELETE', id });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('reminders').delete().eq('id', id);
    if (!error) {
      unmarkIdsSynced(session.householdId, [id]);
    }
  } catch (err) {
    console.warn('Falha ao deletar lembrete no Supabase:', err);
  }
}

/**
 * Instant Single-Product Push to Supabase
 */
export async function pushSingleProduct(product: Product): Promise<void> {
  markRecentLocalAction(product.id);
  localBroadcast?.postMessage({ type: 'PRODUCT_CHANGE', data: product });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('products').upsert({
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

    if (!error) {
      markIdsSynced(session.householdId, [product.id]);
    }
  } catch (err) {
    console.warn('Falha ao enviar produto para o Supabase:', err);
  }
}

/**
 * Instant Single-Product Delete from Supabase
 */
export async function deleteSingleProduct(id: string): Promise<void> {
  markRecentLocalAction(id);
  localBroadcast?.postMessage({ type: 'PRODUCT_DELETE', id });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('products').delete().eq('id', id);
    if (!error) {
      unmarkIdsSynced(session.householdId, [id]);
    }
  } catch (err) {
    console.warn('Falha ao deletar produto no Supabase:', err);
  }
}

/**
 * Instant Single-Receipt Push to Supabase
 */
export async function pushSingleReceipt(receipt: Receipt): Promise<void> {
  markRecentLocalAction(receipt.id);
  localBroadcast?.postMessage({ type: 'RECEIPT_CHANGE', data: receipt });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('receipts').upsert({
      id: receipt.id,
      household_id: session.householdId,
      list_id: receipt.listId || null,
      store_name: receipt.storeName,
      access_key: receipt.accessKey || null,
      total_amount: receipt.totalAmount || 0,
      purchase_date: receipt.purchaseDate,
      raw_type: receipt.rawType || 'qr_code',
      items: receipt.items || [],
      created_at: receipt.createdAt
    }, { onConflict: 'id' });

    if (!error) {
      markIdsSynced(session.householdId, [receipt.id]);
    }
  } catch (err) {
    console.warn('Falha ao enviar nota fiscal para o Supabase:', err);
  }
}

/**
 * Instant Single-Receipt Delete from Supabase
 */
export async function deleteSingleReceipt(id: string): Promise<void> {
  markRecentLocalAction(id);
  localBroadcast?.postMessage({ type: 'RECEIPT_DELETE', id });

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('receipts').delete().eq('id', id);
    if (!error) {
      unmarkIdsSynced(session.householdId, [id]);
    }
  } catch (err) {
    console.warn('Falha ao deletar nota fiscal no Supabase:', err);
  }
}

/**
 * Instant Single-PriceRecord Push to Supabase
 */
export async function pushSinglePriceRecord(record: PriceRecord): Promise<void> {
  markRecentLocalAction(record.id);

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    // Ensure parent product and receipt exist on remote before inserting price_records
    const synced = getSyncedIds(session.householdId);
    if (record.productId && !synced.has(record.productId)) {
      const localProduct = await db.products.get(record.productId);
      if (localProduct) {
        await pushSingleProduct(localProduct);
      }
    }
    if (record.receiptId && !synced.has(record.receiptId)) {
      const localReceipt = await db.receipts.get(record.receiptId);
      if (localReceipt) {
        await pushSingleReceipt(localReceipt);
      }
    }

    const { error } = await client.from('price_records').upsert({
      id: record.id,
      household_id: session.householdId,
      product_id: record.productId,
      receipt_id: record.receiptId || null,
      price: record.price,
      quantity: record.quantity,
      unit: record.unit,
      store_name: record.storeName,
      date: record.date
    }, { onConflict: 'id' });

    if (!error) {
      markIdsSynced(session.householdId, [record.id]);
    }
  } catch (err) {
    console.warn('Falha ao enviar registro de preço para o Supabase:', err);
  }
}

/**
 * Instant Bulk PriceRecord Delete from Supabase
 */
export async function deleteMultiplePriceRecords(ids: string[]): Promise<void> {
  ids.forEach((id) => markRecentLocalAction(id));

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine || ids.length === 0) return;

  try {
    const { error } = await client.from('price_records').delete().in('id', ids);
    if (!error) {
      unmarkIdsSynced(session.householdId, ids);
    }
  } catch (err) {
    console.warn('Falha ao deletar registros de preço no Supabase:', err);
  }
}

/**
 * Instant Single-Member Push to Supabase
 */
export async function pushSingleMember(member: HouseholdMember): Promise<void> {
  markRecentLocalAction(member.id);

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('household_members').upsert({
      id: member.id,
      household_id: session.householdId,
      name: member.name,
      color: member.color || '#10b981',
      avatar_emoji: member.avatarEmoji || '👤',
      is_default: Boolean(member.isDefault)
    }, { onConflict: 'id' });

    if (!error) {
      markIdsSynced(session.householdId, [member.id]);
    }
  } catch (err) {
    console.warn('Falha ao enviar membro para o Supabase:', err);
  }
}

/**
 * Instant Single-Member Delete from Supabase
 */
export async function deleteSingleMember(id: string): Promise<void> {
  markRecentLocalAction(id);

  const client = getSupabaseClient();
  const session = getCurrentSession();
  if (!client || !session || !navigator.onLine) return;

  try {
    const { error } = await client.from('household_members').delete().eq('id', id);
    if (!error) {
      unmarkIdsSynced(session.householdId, [id]);
    }
  } catch (err) {
    console.warn('Falha ao deletar membro no Supabase:', err);
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
