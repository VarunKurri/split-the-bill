import { useContext } from 'react';
import { BillContext, type BillContextValue } from './billContext';

export function useBill(): BillContextValue {
  const context = useContext(BillContext);
  if (!context) throw new Error('useBill must be used inside a BillProvider');
  return context;
}
