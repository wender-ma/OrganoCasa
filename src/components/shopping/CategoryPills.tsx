import React from 'react';
import { ProductCategory } from '../../types';
import { INITIAL_CATEGORIES, CATEGORY_ICONS } from '../../db/seed';

interface CategoryPillsProps {
  selectedCategory: ProductCategory | 'Todas';
  onSelectCategory: (cat: ProductCategory | 'Todas') => void;
}

export const CategoryPills: React.FC<CategoryPillsProps> = ({
  selectedCategory,
  onSelectCategory
}) => {
  return (
    <div className="flex space-x-2 overflow-x-auto no-scrollbar py-2 px-4 -mx-4">
      <button
        onClick={() => onSelectCategory('Todas')}
        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center space-x-1.5 shadow-xs ${
          selectedCategory === 'Todas'
            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
        }`}
      >
        <span>🏷️</span>
        <span>Todas</span>
      </button>

      {INITIAL_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelectCategory(cat)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center space-x-1.5 shadow-xs ${
            selectedCategory === cat
              ? 'bg-emerald-600 text-white shadow-emerald-500/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
          }`}
        >
          <span>{CATEGORY_ICONS[cat] || '📦'}</span>
          <span>{cat}</span>
        </button>
      ))}
    </div>
  );
};

