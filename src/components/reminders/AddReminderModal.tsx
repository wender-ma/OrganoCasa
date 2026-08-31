import React, { useState } from 'react';
import { X, Plus, Trash2, CheckSquare, Calendar, User, Tag } from 'lucide-react';
import { HouseholdMember } from '../../types';

interface AddReminderModalProps {
  isOpen: boolean;
  members: HouseholdMember[];
  onClose: () => void;
  onAddReminder: (data: {
    title: string;
    description?: string;
    assignedMemberId?: string;
    checklist?: string[];
    dueDate?: string;
    category?: string;
  }) => Promise<any>;
}

export const AddReminderModal: React.FC<AddReminderModalProps> = ({
  isOpen,
  members,
  onClose,
  onAddReminder
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedMemberId, setAssignedMemberId] = useState<string>(members[0]?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('Casa');

  // Checklist items
  const [checklist, setChecklist] = useState<string[]>(['']);
  const [currentCheckInput, setCurrentCheckInput] = useState('');

  const handleAddChecklistItem = () => {
    if (currentCheckInput.trim()) {
      setChecklist([...checklist.filter((c) => c.trim().length > 0), currentCheckInput.trim()]);
      setCurrentCheckInput('');
    }
  };

  const handleRemoveChecklistItem = (index: number) => {
    setChecklist(checklist.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const validChecklist = [...checklist, currentCheckInput]
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    await onAddReminder({
      title: title.trim(),
      description: description.trim() || undefined,
      assignedMemberId: assignedMemberId || undefined,
      checklist: validChecklist,
      dueDate: dueDate || undefined,
      category: category || 'Geral'
    });

    setTitle('');
    setDescription('');
    setChecklist(['']);
    setCurrentCheckInput('');
    setDueDate('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Novo Lembrete / Tarefa da Casa
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Título do Lembrete *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Pegar itens na casa da sogra..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
              autoFocus
            />
          </div>

          {/* Checklist sub-items builder */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Checklist de Sub-itens (ex: - arroz, - manteiga, - água)
            </label>

            {/* Existing added checklist items */}
            {checklist.filter((c) => c.trim().length > 0).length > 0 && (
              <div className="space-y-1.5 mb-2">
                {checklist
                  .filter((c) => c.trim().length > 0)
                  .map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium">
                          {item}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(idx)}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded-md"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {/* Input to add next item */}
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={currentCheckInput}
                onChange={(e) => setCurrentCheckInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddChecklistItem();
                  }
                }}
                placeholder="Digitar item (ex: Arroz) e pressionar Enter"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                disabled={!currentCheckInput.trim()}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-emerald-600 hover:text-white disabled:opacity-40 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                + Item
              </button>
            </div>
          </div>

          {/* Member Assignment & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Assigned Member */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Responsável</span>
              </label>
              <select
                value={assignedMemberId}
                onChange={(e) => setAssignedMemberId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Ninguém atribuído</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.avatarEmoji || '👤'} {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Data Limite (Opcional)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações Adicionais
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes, horários, instruções..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Lembrete</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

