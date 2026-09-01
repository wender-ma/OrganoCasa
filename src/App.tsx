import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { BottomNav, NavTab } from './components/layout/BottomNav';
import { ShoppingList } from './components/shopping/ShoppingList';
import { RemindersView } from './components/reminders/RemindersView';
import { ProductCatalogView } from './components/products/ProductCatalogView';
import { ReceiptHistoryView } from './components/receipts/ReceiptHistoryView';
import { ReceiptUploadModal } from './components/receipts/ReceiptUploadModal';
import { ReconciliationModal } from './components/receipts/ReconciliationModal';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useShoppingList } from './hooks/useShoppingList';
import { useReminders } from './hooks/useReminders';
import { useReceipts } from './hooks/useReceipts';
import { seedDatabase } from './db/seed';
import { ParsedReceiptData } from './services/receiptParser';
import { ReconciliationItem } from './types';
import { triggerFullSync, setupRealtimeSubscriptions } from './services/supabaseSync';
import { APP_VERSION, APP_BUILD_DATE } from './version';

export const App: React.FC = () => {
  const isOnline = useOnlineStatus();

  const {
    activeList,
    lists,
    items,
    setActiveListId,
    createList,
    totalItemsCount
  } = useShoppingList();

  const { reminders } = useReminders();
  const { generateReconciliation, applyReconciliation } = useReceipts();

  const [activeTab, setActiveTab] = useState<NavTab>('shopping');
  const [isReceiptUploadOpen, setIsReceiptUploadOpen] = useState(false);

  // Reconciliation state
  const [reconciliationReceipt, setReconciliationReceipt] = useState<ParsedReceiptData | null>(null);
  const [reconciliationItems, setReconciliationItems] = useState<ReconciliationItem[]>([]);
  const [isReconciliationOpen, setIsReconciliationOpen] = useState(false);

  // Initialize cloud sync if logged in, or clean local DB if not logged in
  useEffect(() => {
    const session = typeof localStorage !== 'undefined' && localStorage.getItem('organocasa_user_session');
    if (session) {
      triggerFullSync().catch(console.warn);
      setupRealtimeSubscriptions();
    } else {
      // Not logged in: wipe demo items so the app is completely empty
      seedDatabase().catch(console.warn);
    }
  }, []);

  const handleReceiptParsed = async (data: ParsedReceiptData) => {
    setReconciliationReceipt(data);
    const generated = await generateReconciliation(data.items, items);
    setReconciliationItems(generated);
    setIsReconciliationOpen(true);
  };

  const handleApplyReconciliation = async (
    receiptData: ParsedReceiptData,
    finalItems: ReconciliationItem[]
  ) => {
    await applyReconciliation(receiptData, finalItems);
  };

  const pendingRemindersCount = reminders.filter((r) => !r.isCompleted).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Header */}
      <Header
        activeList={activeList}
        lists={lists}
        onSelectList={setActiveListId}
        onCreateList={createList}
        isOnline={isOnline}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-5">
        {activeTab === 'shopping' && (
          <ShoppingList onOpenReceiptUpload={() => setIsReceiptUploadOpen(true)} />
        )}

        {activeTab === 'reminders' && <RemindersView />}

        {activeTab === 'products' && <ProductCatalogView />}

        {activeTab === 'receipts' && (
          <ReceiptHistoryView onOpenUpload={() => setIsReceiptUploadOpen(true)} />
        )}

        {/* Footer Version Indicator */}
        <footer className="mt-10 pt-6 pb-24 border-t border-slate-200/60 dark:border-slate-800/60 text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-850 rounded-full border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>OrganoCasa {APP_VERSION}</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Build {APP_BUILD_DATE}</span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            {isOnline ? '🟢 Conectado & Sincronizado' : '🟠 Modo Offline'}
          </p>
        </footer>
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingRemindersCount={pendingRemindersCount}
        shoppingItemsCount={totalItemsCount}
      />

      {/* Receipt Upload Modal */}
      <ReceiptUploadModal
        isOpen={isReceiptUploadOpen}
        onClose={() => setIsReceiptUploadOpen(false)}
        onReceiptParsed={handleReceiptParsed}
      />

      {/* Smart Reconciliation Modal */}
      <ReconciliationModal
        isOpen={isReconciliationOpen}
        receiptData={reconciliationReceipt}
        items={reconciliationItems}
        onClose={() => setIsReconciliationOpen(false)}
        onConfirm={handleApplyReconciliation}
      />
    </div>
  );
};

export default App;
