import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { calculateSplit } from '../domain/split';
import { BillContext, type BillContextValue } from './billContext';
import { billReducer } from './billReducer';
import { clearStoredBill, loadBill, saveBill } from './persistence';

export function BillProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadBill);
  const [state, dispatch] = useReducer(billReducer, { bill: initial.bill, undo: null });
  const [persistenceWarning, setPersistenceWarning] = useState(initial.warning);

  useEffect(() => {
    // A reset should not leave the old bill sitting in storage if the tab
    // is closed before the next write.
    const isEmpty = state.bill.people.length === 0 && state.bill.items.length === 0;
    const saved = isEmpty ? clearStoredBill() : saveBill(state.bill);
    if (!saved) {
      setPersistenceWarning(
        'This bill cannot be saved on this device. Keep this page open until you finish.',
      );
    }
  }, [state.bill]);

  const value = useMemo<BillContextValue>(
    () => ({
      bill: state.bill,
      summary: calculateSplit(state.bill),
      undoLabel: state.undo?.label ?? null,
      persistenceWarning,
      dismissPersistenceWarning: () => setPersistenceWarning(null),
      dispatch,
      peopleById: new Map(state.bill.people.map((p) => [p.id, p])),
    }),
    [state.bill, state.undo, persistenceWarning],
  );

  return <BillContext.Provider value={value}>{children}</BillContext.Provider>;
}
