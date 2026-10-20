import { Download, Share } from 'lucide-react';
import { useInstallPrompt } from '@/lib/installPrompt';
import { cn } from '@/lib/utils';

// renders nothing once the app is already installed, or on a browser that offers neither path
export function InstallControl({ className }: { className?: string }) {
  const { canInstall, showIOSHint, promptInstall } = useInstallPrompt();

  if (canInstall) {
    return (
      <button
        onClick={promptInstall}
        className={cn('inline-flex h-11 items-center gap-2 rounded-md px-3 text-[15px] font-medium text-ink/70 transition-colors hover:text-ink', className)}
      >
        <Download size={16} />
        Install app
      </button>
    );
  }

  if (showIOSHint) {
    return (
      <span className={cn('inline-flex items-center gap-2 text-[14px] text-ink/55', className)}>
        <Share size={15} />
        Tap Share, then Add to Home Screen to install
      </span>
    );
  }

  return null;
}
