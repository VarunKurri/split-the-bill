import { createContext, type Dispatch } from 'react';
import type { Bill, BillSummary, ID, Person } from '../domain/types';
import type { BillAction } from './billReducer';

export interface BillContextValue {
  bill: Bill;
  summary: BillSummary;
  undoLabel: string | null;
  dispatch: Dispatch<BillAction>;
  peopleById: Map<ID, Person>;
}

/**
 * The context object lives apart from both the provider component and the
 * hook so that each module exports only one kind of thing — which is what
 * keeps React Fast Refresh working during development.
 */
export const BillContext = createContext<BillContextValue | null>(null);
