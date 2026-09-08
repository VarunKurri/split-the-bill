import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}

export function Card({
  title,
  trailing,
  children,
  className,
  headingLevel = 2,
}: CardProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <section className={[styles.card, className ?? ''].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <Heading className={styles.title}>{title}</Heading>
        {trailing && <div className={styles.trailing}>{trailing}</div>}
      </header>
      {children}
    </section>
  );
}
