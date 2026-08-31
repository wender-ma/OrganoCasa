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

  // Seed DB on mount & initialize cloud sync
  useEffect(() => {
    seedDatabase()
      .then(() => {
        triggerFullSync().catch(console.warn);
        setupRealtimeSubscriptions();
      })
      .catch((e) => console.error('Erro ao inicializar DB:', e));
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
