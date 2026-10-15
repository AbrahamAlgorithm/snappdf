import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GitHubStarButton } from '@/src/components/GitHubStarButton';
import { toolHref } from '@/src/lib/router';

const PERKS = ['Saved documents and history', 'Reusable signatures', 'Pick up on any device'];

// Accounts need a backend that doesn't exist yet. Until it does, every "Create account" /
// "Log in" entry point opens this and steers people to quick edit.
export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl shadow-black/15 ring-1 ring-black/5"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-subtle transition-colors hover:bg-line"
            >
              <span aria-hidden="true" className="relative block size-3">
                <span className="absolute left-0 top-1/2 h-[1.5px] w-3 -translate-y-1/2 rotate-45 rounded-full bg-ink" />
                <span className="absolute left-0 top-1/2 h-[1.5px] w-3 -translate-y-1/2 -rotate-45 rounded-full bg-ink" />
              </span>
            </button>

            <span className="inline-flex rounded-[7px] bg-lime px-2 py-0.5 text-[11px] font-semibold text-black">Coming soon</span>
            <h2 id="account-modal-title" className="mt-4 text-[22px] font-semibold tracking-[-0.03em]">
              Accounts are almost here
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink/60">
              Soon you’ll be able to sign up, still free, and keep your work between visits. Until then, every tool
              works right now with no sign-up.
            </p>

            <ul className="mt-5 space-y-2.5 border-t border-line pt-5">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-center gap-3 text-[14px] text-ink/80">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />
                  {perk}
                </li>
              ))}
            </ul>

            <a
              href={toolHref('image-to-pdf')}
              onClick={onClose}
              className="mt-6 flex h-11 items-center justify-center rounded-xl bg-ink text-[14px] font-medium text-canvas transition-colors hover:bg-ink/85"
            >
              Continue without an account
            </a>
            <GitHubStarButton label="Star on GitHub to follow along" className="mt-2 h-11 w-full justify-center" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
