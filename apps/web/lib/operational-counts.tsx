'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useSession } from './session';

type OperationalCountsContextValue = {
  pendingStockReceipts: number;
  refreshOperationalCounts: () => Promise<void>;
};

const OperationalCountsContext = createContext<OperationalCountsContextValue | null>(null);

export function OperationalCountsProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [pendingStockReceipts, setPendingStockReceipts] = useState(0);

  const refreshOperationalCounts = useCallback(async () => {
    if (!session) {
      setPendingStockReceipts(0);
      return;
    }
    try {
      const data = await api<{ pending_receipts?: unknown[] }>('/api/overview');
      setPendingStockReceipts(data.pending_receipts?.length ?? 0);
    } catch {
      setPendingStockReceipts(0);
    }
  }, [session]);

  useEffect(() => {
    void refreshOperationalCounts();
  }, [refreshOperationalCounts]);

  return (
    <OperationalCountsContext.Provider value={{ pendingStockReceipts, refreshOperationalCounts }}>
      {children}
    </OperationalCountsContext.Provider>
  );
}

export function useOperationalCounts() {
  const context = useContext(OperationalCountsContext);
  if (!context) {
    throw new Error('useOperationalCounts must be used within OperationalCountsProvider');
  }
  return context;
}
