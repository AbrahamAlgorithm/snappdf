import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  FilePenLine,
  FileText,
  FileType,
  IdCard,
  Image,
  Images,
  Landmark,
  NotebookPen,
  Receipt,
  ReceiptText,
  Sheet,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useInView } from '@/src/pages/landing/motion';

/* Where a logo bar would go. snappdf has no customer logos to show, so the bar names the files
   it works with instead, cycling between the formats and the everyday documents they hold. */
const SETS = [
  [
    [Image, 'JPG and PNG'],
    [Smartphone, 'iPhone HEIC'],
    [Images, 'WEBP and GIF'],
    [FileText, 'PDF documents'],
    [Sheet, 'CSV and JSON'],
    [FileType, 'Plain text'],
  ],
  [
    [FilePenLine, 'Contracts'],
    [Receipt, 'Receipts'],
    [Landmark, 'Bank statements'],
    [IdCard, 'ID scans'],
    [ReceiptText, 'Invoices'],
    [NotebookPen, 'Class notes'],
  ],
] as const;

export function FileBar() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const onScreen = useInView(ref, { once: false, rootMargin: '0px' });
  const reduced = useReducedMotion();
  const [cur, setCur] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused || !onScreen) return;
    const id = setInterval(() => setCur((c) => (c + 1) % SETS.length), 5000);
    return () => clearInterval(id);
  }, [reduced, paused, onScreen]);

  return (
    <section
      ref={ref}
      className={cn('fb', inView && 'is-in')}
      aria-labelledby="fb-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p id="fb-title" className="fb-tag ent ent-fade">
          Works with the files you already have
        </p>
        <ul className="fb-list">
          {SETS[0].map((_, i) => (
            <li key={i} className="fb-item">
              {SETS.map((set, s) => {
                const [Icon, label] = set[i];
                return (
                  <span key={s} className={cn('fb-mark', s !== cur && 'is-off')} style={{ '--i': i } as CSSProperties} aria-hidden={s !== cur}>
                    <Icon aria-hidden="true" />
                    {label}
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
