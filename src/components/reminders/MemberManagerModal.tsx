import React, { useState } from 'react';
import { X, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { HouseholdMember } from '../../types';

interface MemberManagerModalProps {
  isOpen: boolean;
  members: HouseholdMember[];
  onClose: () => void;
  onAddMember: (name: string, color: string, emoji: string) => Promise<any>;
  onDeleteMember: (id: string) => Promise<void>;
}

const PRESET_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
];

const PRESET_EMOJIS = ['👤', '👩', '👨', '👧', '👦', '👵', '👴', '🐶', '🐱', '⭐'];

export const MemberManagerModal: React.FC<MemberManagerModalProps> = ({
  isOpen,
  members,
  onClose,
  onAddMember,
  onDeleteMember
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#10b981');
  const [emoji, setEmoji] = useState('👤');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onAddMember(name.trim(), color, emoji);
    setName('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Membros da Casa
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Member List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Pessoas Cadastradas ({members.length})
            </h4>
            <div className="space-y-1.5">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-2xs"
                      style={{ backgroundColor: `${member.color}20`, borderColor: member.color }}
                    >
                      {member.avatarEmoji || '👤'}
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white block">
                        {member.name}
                      </span>
                      {member.isDefault && (
                        <span className="text-[10px] text-emerald-600 font-semibold">
                          (Padrão / Principal)
                        </span>
                      )}
                    </div>
                  </div>

                  {!member.isDefault && members.length > 1 && (
                    <button
                      onClick={() => onDeleteMember(member.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Excluir membro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add New Member Form */}
          <form
            onSubmit={handleSubmit}
            className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3"
          >
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cadastrar Novo Membro</span>
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome da Pessoa *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Mãe, Lucas, Sogra..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            {/* Emoji selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Avatar Emoji
              </label>
              <div className="flex space-x-1.5 overflow-x-auto py-1">
                {PRESET_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border transition-all ${
                      emoji === em
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950 scale-110'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* Color selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cor Identificadora
              </label>
              <div className="flex space-x-2 py-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      color === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Membro</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

