import React from 'react';
import { ProductCategory } from '../../types';
import { INITIAL_CATEGORIES, CATEGORY_ICONS } from '../../db/seed';

interface CategoryPillsProps {
  selectedCategory: ProductCategory | null;
  onSelectCategory: (cat: ProductCategory | null) => void;
  categories?: ProductCategory[];
}

export const CategoryPills: React.FC<CategoryPillsProps> = ({
  selectedCategory,
  onSelectCategory,
  categories
}) => {
  const visibleCategories = categories ?? INITIAL_CATEGORIES;

  if (visibleCategories.length === 0) {
    return null;
  }

  return (
    <div className="flex space-x-2 overflow-x-auto no-scrollbar py-2 px-4 -mx-4">
      {visibleCategories.map((cat) => {
        const isSelected = selectedCategory === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelectCategory(isSelected ? null : cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center space-x-1.5 shadow-xs ${
              isSelected
                ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
            }`}
          >
            <span>{CATEGORY_ICONS[cat] || '📦'}</span>
            <span>{cat}</span>
          </button>
        );
      })}
    </div>
  );
};

