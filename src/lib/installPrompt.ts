import { useEffect, useState } from 'react';

// Chrome's own install event, not yet in lib.dom.d.ts
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isStandalone() {
  // pages rendered at build time have no window, and aren't an installed app
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIOS() {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Android/Chrome fire beforeinstallprompt so we can show our own "Install app" button.
// iOS never fires it, home screen install only happens through Safari's Share sheet, so we
// just flag that case and let the caller show a hint instead.
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const update = () => setStandalone(isStandalone());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return {
    canInstall: deferred !== null,
    showIOSHint: !standalone && isIOS(),
    async promptInstall() {
      if (!deferred) return;
      await deferred.prompt();
      setDeferred(null);
    },
  };
}
