import React, { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { useReminders } from '../../hooks/useReminders';
import { ReminderCard } from './ReminderCard';
import { AddReminderModal } from './AddReminderModal';
import { MemberManagerModal } from './MemberManagerModal';

export const RemindersView: React.FC = () => {
  const {
    members,
    reminders,
    addMember,
    deleteMember,
    addReminder,
    toggleReminderCompleted,
    toggleChecklistItem,
    addChecklistItem,
    deleteReminder
  } = useReminders();

  const [selectedMemberId, setSelectedMemberId] = useState<string | 'all'>('all');
  const [statusTab, setStatusTab] = useState<'pending' | 'completed' | 'all'>('pending');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);

  // Filter reminders
  const filteredReminders = reminders.filter((rem) => {
    if (selectedMemberId !== 'all' && rem.assignedMemberId !== selectedMemberId) {
      return false;
    }
    if (statusTab === 'pending' && rem.isCompleted) return false;
    if (statusTab === 'completed' && !rem.isCompleted) return false;
    return true;
  });

  const pendingCount = reminders.filter((r) => !r.isCompleted).length;

  return (
    <div className="space-y-4 pb-28">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-3xl p-5 text-white shadow-xl shadow-teal-900/10 flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-teal-100 uppercase tracking-wider">
            Lembretes & Tarefas da Casa
          </span>
          <h2 className="text-2xl font-black mt-0.5">
            {pendingCount} {pendingCount === 1 ? 'pendência' : 'pendências'}
          </h2>
          <p className="text-xs text-teal-100/90 mt-1">
            Organize afazeres, compras em outros lugares e recados da família.
          </p>
        </div>

        <button
          onClick={() => setIsMemberModalOpen(true)}
          className="px-3.5 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl text-xs font-bold text-white flex items-center space-x-1.5 border border-white/30 transition-all shadow-xs"
        >
          <Users className="w-4 h-4" />
          <span>Membros ({members.length})</span>
        </button>
      </div>

      {/* Member Filter Pills */}
      <div className="flex space-x-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setSelectedMemberId('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-xs ${
            selectedMemberId === 'all'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          👥 Todos os membros
        </button>

        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedMemberId(m.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 shadow-xs ${
              selectedMemberId === m.id
                ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>{m.avatarEmoji || '👤'}</span>
            <span>{m.name}</span>
          </button>
        ))}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-700">
        <button
          onClick={() => setStatusTab('pending')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
            statusTab === 'pending'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
          }`}
        >
          Pendentes ({pendingCount})
        </button>
        <button
          onClick={() => setStatusTab('completed')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
            statusTab === 'completed'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
          }`}
        >
          Concluídos ({reminders.filter((r) => r.isCompleted).length})
        </button>
        <button
          onClick={() => setStatusTab('all')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
            statusTab === 'all'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
          }`}
        >
          Todos ({reminders.length})
        </button>
      </div>

      {/* Reminders List */}
      {filteredReminders.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white dark:bg-slate-850 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-500 flex items-center justify-center mx-auto text-2xl shadow-xs">
            📋
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Nenhum lembrete encontrado nesta visualização
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Crie lembretes com listas de itens e delegue para pessoas da casa.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 inline-flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Lembrete</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReminders.map((reminder) => {
            const member = members.find((m) => m.id === reminder.assignedMemberId);
            return (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                assignedMember={member}
                onToggleCompleted={toggleReminderCompleted}
                onToggleCheckItem={toggleChecklistItem}
                onAddCheckItem={addChecklistItem}
                onDelete={deleteReminder}
              />
            );
          })}
        </div>
      )}

      {/* FAB Add Reminder */}
      <div className="fixed bottom-20 right-4 z-30 max-w-md mx-auto flex items-center space-x-2">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm rounded-full shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition-all"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Novo Lembrete</span>
        </button>
      </div>

      {/* Modals */}
      <AddReminderModal
        isOpen={isAddModalOpen}
        members={members}
        onClose={() => setIsAddModalOpen(false)}
        onAddReminder={addReminder}
      />

      <MemberManagerModal
        isOpen={isMemberModalOpen}
        members={members}
        onClose={() => setIsMemberModalOpen(false)}
        onAddMember={addMember}
        onDeleteMember={deleteMember}
      />
    </div>
  );
};
