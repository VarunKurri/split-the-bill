import { useCallback, useEffect, useRef, useState } from 'react';
import { useBill } from '../state/BillContext';
import { buildShareText, copyText } from './shareSummary';

/**
 * Copy the summary and show "Copied" for a moment. Each call site keeps its
 * own feedback state, so the top bar and the summary card can both offer the
 * action without one of them lighting up when the other is pressed.
 */
export function useShareSummary() {
  const { bill, summary } = useBill();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const share = useCallback(async () => {
    const ok = await copyText(buildShareText(bill, summary));
    setCopied(ok);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2400);
  }, [bill, summary]);

  return { share, copied };
}
