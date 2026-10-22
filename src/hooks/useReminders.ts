import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { Reminder, HouseholdMember, ReminderCheckItem } from '../types';
import {
  pushSingleReminder,
  deleteSingleReminder,
  pushSingleMember,
  deleteSingleMember
} from '../services/supabaseSync';

export function useReminders() {
  const members = useLiveQuery(() => db.householdMembers.toArray()) || [];
  const reminders = useLiveQuery(() => db.reminders.reverse().sortBy('createdAt')) || [];

  // Actions for Members
  async function addMember(name: string, color: string, avatarEmoji: string = '👤') {
    const newMember: HouseholdMember = {
      id: `member-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      color,
      avatarEmoji
    };
    await db.householdMembers.add(newMember);
    pushSingleMember(newMember).catch(console.warn);
    return newMember;
  }

  async function updateMember(id: string, changes: Partial<HouseholdMember>) {
    await db.householdMembers.update(id, changes);
    const updated = await db.householdMembers.get(id);
    if (updated) {
      pushSingleMember(updated).catch(console.warn);
    }
  }

  async function deleteMember(id: string) {
    await db.householdMembers.delete(id);
    deleteSingleMember(id).catch(console.warn);
  }

  // Actions for Reminders
  async function addReminder(data: {
    title: string;
    description?: string;
    assignedMemberId?: string;
    checklist?: string[]; // Array of strings converted to ReminderCheckItem
    dueDate?: string;
    category?: string;
  }) {
    const checklistItems: ReminderCheckItem[] = (data.checklist || []).map((text, idx) => ({
      id: `chk-${Date.now()}-${idx}`,
      text: text.trim(),
      isDone: false
    }));

    const now = new Date().toISOString();
    const newReminder: Reminder = {
      id: `rem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: data.title.trim(),
      description: data.description?.trim(),
      assignedMemberId: data.assignedMemberId,
      checklist: checklistItems,
      dueDate: data.dueDate,
      isCompleted: false,
      category: data.category || 'Geral',
      createdAt: now,
      updatedAt: now
    };

    await db.reminders.add(newReminder);
    pushSingleReminder(newReminder).catch(console.warn);
    return newReminder;
  }

  async function updateReminder(id: string, changes: Partial<Reminder>) {
    const updatedAt = new Date().toISOString();
    await db.reminders.update(id, {
      ...changes,
      updatedAt
    });
    const rem = await db.reminders.get(id);
    if (rem) {
      pushSingleReminder(rem).catch(console.warn);
    }
  }

  async function toggleReminderCompleted(id: string) {
    const rem = await db.reminders.get(id);
    if (rem) {
      const isCompleted = !rem.isCompleted;
      const updatedChecklist = isCompleted
        ? rem.checklist.map((c) => ({ ...c, isDone: true }))
        : rem.checklist;

      const updatedRem: Reminder = {
        ...rem,
        isCompleted,
        checklist: updatedChecklist,
        updatedAt: new Date().toISOString()
      };

      await db.reminders.update(id, {
        isCompleted,
        checklist: updatedChecklist,
        updatedAt: updatedRem.updatedAt
      });
      pushSingleReminder(updatedRem).catch(console.warn);
    }
  }

  async function toggleChecklistItem(reminderId: string, checkItemId: string) {
    const rem = await db.reminders.get(reminderId);
    if (rem) {
      const updatedChecklist = rem.checklist.map((c) =>
        c.id === checkItemId ? { ...c, isDone: !c.isDone } : c
      );

      const allDone = updatedChecklist.length > 0 && updatedChecklist.every((c) => c.isDone);
      const updatedRem: Reminder = {
        ...rem,
        checklist: updatedChecklist,
        isCompleted: allDone ? true : rem.isCompleted,
        updatedAt: new Date().toISOString()
      };

      await db.reminders.update(reminderId, {
        checklist: updatedChecklist,
        isCompleted: updatedRem.isCompleted,
        updatedAt: updatedRem.updatedAt
      });
      pushSingleReminder(updatedRem).catch(console.warn);
    }
  }

  async function addChecklistItem(reminderId: string, text: string) {
    const rem = await db.reminders.get(reminderId);
    if (rem && text.trim()) {
      const newItem: ReminderCheckItem = {
        id: `chk-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        text: text.trim(),
        isDone: false
      };
      const updatedRem: Reminder = {
        ...rem,
        checklist: [...rem.checklist, newItem],
        isCompleted: false,
        updatedAt: new Date().toISOString()
      };
      await db.reminders.update(reminderId, {
        checklist: updatedRem.checklist,
        isCompleted: false,
        updatedAt: updatedRem.updatedAt
      });
      pushSingleReminder(updatedRem).catch(console.warn);
    }
  }

  async function deleteReminder(id: string) {
    await db.reminders.delete(id);
    deleteSingleReminder(id).catch(console.warn);
  }

  return {
    members,
    reminders,
    addMember,
    updateMember,
    deleteMember,
    addReminder,
    updateReminder,
    toggleReminderCompleted,
    toggleChecklistItem,
    addChecklistItem,
    deleteReminder
  };
}
