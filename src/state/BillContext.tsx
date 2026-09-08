import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { calculateSplit } from '../domain/split';
import type { Bill, BillSummary, ID, Person } from '../domain/types';
import { billReducer, createEmptyBill, type BillAction, type BillState } from './billReducer';
import { clearStoredBill, loadBill, saveBill } from './persistence';

interface BillContextValue {
  bill: Bill;
  summary: BillSummary;
  undoLabel: string | null;
  dispatch: Dispatch<BillAction>;
  peopleById: Map<ID, Person>;
}

const BillContext = createContext<BillContextValue | null>(null);

function init(): BillState {
  return { bill: loadBill(), undo: null };
}

export function BillProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(billReducer, undefined, init);

  useEffect(() => {
    // A reset should not leave the old bill sitting in storage if the tab
    // is closed before the next write.
    const isEmpty = state.bill.people.length === 0 && state.bill.items.length === 0;
    if (isEmpty) clearStoredBill();
    else saveBill(state.bill);
  }, [state.bill]);

  const value = useMemo<BillContextValue>(
    () => ({
      bill: state.bill,
      summary: calculateSplit(state.bill),
      undoLabel: state.undo?.label ?? null,
      dispatch,
      peopleById: new Map(state.bill.people.map((p) => [p.id, p])),
    }),
    [state.bill, state.undo],
  );

  return <BillContext.Provider value={value}>{children}</BillContext.Provider>;
}

export function useBill(): BillContextValue {
  const context = useContext(BillContext);
  if (!context) throw new Error('useBill must be used inside a BillProvider');
  return context;
}

export { createEmptyBill };
