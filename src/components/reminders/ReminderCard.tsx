import React, { useState } from 'react';
import { Check, Calendar, Trash2, Plus } from 'lucide-react';
import { Reminder, HouseholdMember } from '../../types';

interface ReminderCardProps {
  reminder: Reminder;
  assignedMember?: HouseholdMember;
  onToggleCompleted: (id: string) => void;
  onToggleCheckItem: (reminderId: string, checkItemId: string) => void;
  onAddCheckItem: (reminderId: string, text: string) => void;
  onDelete: (id: string) => void;
}

export const ReminderCard: React.FC<ReminderCardProps> = ({
  reminder,
  assignedMember,
  onToggleCompleted,
  onToggleCheckItem,
  onAddCheckItem,
  onDelete
}) => {
  const [quickInput, setQuickInput] = useState('');

  const completedCheckCount = reminder.checklist.filter((c) => c.isDone).length;
  const totalCheckCount = reminder.checklist.length;

  const handleAddSubItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickInput.trim()) {
      onAddCheckItem(reminder.id, quickInput.trim());
      setQuickInput('');
    }
  };

  const isOverdue =
    reminder.dueDate &&
    !reminder.isCompleted &&
    new Date(reminder.dueDate).setHours(23, 59, 59, 999) < Date.now();

  return (
    <div
      className={`p-4 rounded-2xl border transition-all duration-200 ${
        reminder.isCompleted
          ? 'bg-slate-100/60 dark:bg-slate-850/40 border-slate-200 dark:border-slate-800 opacity-80'
          : 'bg-white dark:bg-slate-850 border-slate-200/80 dark:border-slate-750 shadow-xs hover:shadow-md'
      }`}
    >
      {/* Top Row: Main Status Checkbox, Title, Member & Delete */}
      <div className="flex items-start justify-between space-x-3">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <button
            onClick={() => onToggleCompleted(reminder.id)}
            className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all duration-150 mt-0.5 shrink-0 ${
              reminder.isCompleted
                ? 'bg-emerald-500 text-white shadow-xs'
                : 'border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-500 bg-transparent'
            }`}
          >
            {reminder.isCompleted && <Check className="w-4 h-4 stroke-[3]" />}
          </button>

          <div className="min-w-0 flex-1">
            <h4
              className={`text-sm font-bold leading-tight ${
                reminder.isCompleted
                  ? 'line-through text-slate-400 dark:text-slate-500'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {reminder.title}
            </h4>

            {reminder.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {reminder.description}
              </p>
            )}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={() => onDelete(reminder.id)}
          className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          title="Excluir lembrete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Checklist Sub-items */}
      {reminder.checklist.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-750 space-y-1.5 pl-2">
          {reminder.checklist.map((item) => (
            <label
              key={item.id}
              className="flex items-center space-x-2.5 cursor-pointer group/chk py-0.5"
            >
              <input
                type="checkbox"
                checked={item.isDone}
                onChange={() => onToggleCheckItem(reminder.id, item.id)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-600"
              />
              <span
                className={`text-xs transition-colors ${
                  item.isDone
                    ? 'line-through text-slate-400 dark:text-slate-500'
                    : 'text-slate-700 dark:text-slate-200 group-hover/chk:text-emerald-600'
                }`}
              >
                {item.text}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Inline Add Sub-Item */}
      {!reminder.isCompleted && (
        <form onSubmit={handleAddSubItem} className="mt-2.5 flex items-center space-x-1.5">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="+ Adicionar sub-item..."
            className="flex-1 px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {quickInput.trim() && (
            <button
              type="submit"
              className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </form>
      )}

      {/* Meta Footer: Assigned Member & Due Date */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-750 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-y-1">
        {/* Member Badge */}
        {assignedMember ? (
          <div
            className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full font-semibold border"
            style={{
              backgroundColor: `${assignedMember.color}15`,
              borderColor: `${assignedMember.color}40`,
              color: assignedMember.color
            }}
          >
            <span>{assignedMember.avatarEmoji || '👤'}</span>
            <span>{assignedMember.name}</span>
          </div>
        ) : (
          <span className="text-slate-400 text-[10px]">Sem responsável</span>
        )}

        {/* Due Date or Progress */}
        <div className="flex items-center space-x-2">
          {totalCheckCount > 0 && (
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {completedCheckCount}/{totalCheckCount} itens
            </span>
          )}

          {reminder.dueDate && (
            <div
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg ${
                isOverdue
                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>
                {new Date(reminder.dueDate + 'T12:00:00').toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short'
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
