import { useEffect, useSyncExternalStore } from 'react';
import type { ToolId } from '@/lib/site';

// tools with files open in this tab, only kept in memory
let inProgress: ToolId[] = [];
const listeners = new Set<() => void>();

// ask before a refresh or close throws the work away
function warnBeforeLeaving(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

function update(next: ToolId[]) {
  inProgress = next;
  if (next.length) window.addEventListener('beforeunload', warnBeforeLeaving);
  else window.removeEventListener('beforeunload', warnBeforeLeaving);
  // pull to refresh would throw the files away too, and iphones don't ask first (see index.css)
  document.documentElement.classList.toggle('has-work', next.length > 0);
  listeners.forEach((listener) => listener());
}

// no cleanup on purpose, a hidden tool still has its work
export function useReportWork(tool: ToolId, hasWork: boolean) {
  useEffect(() => {
    if (hasWork === inProgress.includes(tool)) return;
    update(hasWork ? [...inProgress, tool] : inProgress.filter((t) => t !== tool));
  }, [tool, hasWork]);
}

export function useToolsInProgress() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => inProgress,
  );
}
