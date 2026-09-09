import { BillCard } from './features/BillCard';
import { ChargesCard } from './features/ChargesCard';
import { ItemsCard } from './features/ItemsCard';
import { PaymentsCard } from './features/PaymentsCard';
import { PeopleCard } from './features/PeopleCard';
import { SummaryCard } from './features/SummaryCard';
import { TopBar } from './features/TopBar';
import { UndoToast } from './features/UndoToast';
import { BillProvider } from './state/BillProvider';
import styles from './App.module.css';

/**
 * One workspace, not a wizard.
 *
 * A wizard would make you commit to "all the people" before "all the items",
 * which is the opposite of how a table works — plates and people arrive in
 * whatever order they arrive. Everything stays on one screen, and the rail
 * keeps a live answer to "what do I owe?" as you go.
 */
export default function App() {
  return (
    <BillProvider>
      <div className={styles.app}>
        <TopBar />
        <main className={styles.body}>
          <div className={styles.main}>
            <PeopleCard />
            <ItemsCard />
          </div>
          {/*
            The rail reads top to bottom as the questions you ask in order:
            what did we order, what did it come to, who has paid, and so what
            does each person owe.
          */}
          <aside className={styles.rail} aria-label="Bill summary">
            <BillCard />
            <ChargesCard />
            <PaymentsCard />
            <SummaryCard />
          </aside>
        </main>
        <UndoToast />
      </div>
    </BillProvider>
  );
}
