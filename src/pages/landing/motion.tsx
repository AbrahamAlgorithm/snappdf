import { Fragment, useEffect, useState, type CSSProperties, type RefObject } from 'react';

// true once the element is 12% into the viewport, uses rootMargin so tall sections work too
export function useInView(ref: RefObject<Element | null>, { once = true, rootMargin = '0px 0px -12% 0px' } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin]);
  return inView;
}

// counts up every `ms` while `run` is true, drives the demo animations
export function useTicker(run: boolean, ms: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [run, ms]);
  return t;
}

type Part = { text: string; className?: string };
export type Line = string | { parts: Part[] };

// heading words that slide up into view once a parent gets .is-in
export function SplitText({ lines, delay = 0, step = 110, duration = 1000 }: { lines: Line[]; delay?: number; step?: number; duration?: number }) {
  return (
    <>
      {lines.map((line, li) => {
        const parts = typeof line === 'string' ? [{ text: line }] : line.parts;
        const timing = { '--d': `${delay + li * step}ms`, '--t': `${duration}ms` } as CSSProperties;
        return (
          <Fragment key={li}>
            <span className="ln">
              {parts.map((part, pi) => {
                const words = part.text.split(' ');
                const nodes = words.map((word, wi) => (
                  <Fragment key={wi}>
                    <span className="wm">
                      <span style={timing}>{word}</span>
                    </span>
                    {wi < words.length - 1 && ' '}
                  </Fragment>
                ));
                return (
                  <Fragment key={pi}>
                    {pi > 0 && ' '}
                    {part.className ? <span className={part.className}>{nodes}</span> : nodes}
                  </Fragment>
                );
              })}
            </span>
            {li < lines.length - 1 && ' '}
          </Fragment>
        );
      })}
    </>
  );
}

export const pad = (n: number) => String(n).padStart(2, '0');
