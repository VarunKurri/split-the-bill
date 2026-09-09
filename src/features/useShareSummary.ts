import { useCallback, useEffect, useRef, useState } from 'react';
import { useBill } from '../state/useBill';
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

  // Returns void rather than a promise: this is handed straight to onClick,
  // and a floating promise in an event handler is a footgun nobody needs.
  const share = useCallback(() => {
    void (async () => {
      const ok = await copyText(buildShareText(bill, summary));
      setCopied(ok);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2400);
    })();
  }, [bill, summary]);

  return { share, copied };
}
