import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Logo, LogoMark } from '@/components/brand';
import { GitHubStarButton } from '@/components/GitHubStarButton';
import { InstallControl } from '@/components/InstallControl';
import { APP_HREF, toolHref } from '@/lib/router';
import { GITHUB_URL, TOOL_GROUPS, TOOLS } from '@/lib/site';
import { cn } from '@/lib/utils';

// the nav, footer and page frame shared by the landing page, privacy, report and 404 pages

const EASE = [0.21, 0.47, 0.32, 0.98] as const;
export const AUTHOR_URL = 'https://abrahamalgorithm.tech';

// nav
// sections of the landing page, written with / so they work from any page
const NAV_LINKS = [
  { label: 'Tools', href: '/#tools' },
  { label: 'Privacy', href: '/#privacy' },
  { label: 'FAQ', href: '/#faq' },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // lock page scroll while the mobile menu is open
  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-300',
          menuOpen ? 'bg-canvas' : scrolled ? 'bg-canvas/85 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl' : 'bg-transparent',
        )}
      >
        <div className="relative mx-auto flex h-20 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <a href="/" aria-label="snappdf home" onClick={() => location.pathname === '/' && window.scrollTo({ top: 0 })} className="flex h-11 items-center rounded-md">
            <Logo />
          </a>

          <nav aria-label="Main" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="flex h-11 items-center rounded-md px-3 text-[15px] font-medium text-ink/70 transition-colors hover:text-ink">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <InstallControl className="hidden sm:flex" />
            <a href={APP_HREF} className="hidden h-11 items-center px-3 text-[15px] font-medium text-ink/70 transition-colors hover:text-ink sm:flex">
              Get started
            </a>
            <GitHubStarButton className="hidden h-11 sm:inline-flex" />
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="grid size-11 place-items-center md:hidden"
            >
              <span aria-hidden="true" className="relative block h-3 w-5">
                <span className={cn('absolute left-0 h-[2px] w-5 rounded-full bg-ink transition-transform duration-300', menuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0')} />
                <span className={cn('absolute left-0 h-[2px] w-5 rounded-full bg-ink transition-transform duration-300', menuOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-0')} />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* menu lives outside the header, the header's blur would trap it */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed inset-0 z-40 overflow-y-auto bg-canvas px-4 pb-10 pt-24 md:hidden"
          >
            <motion.nav aria-label="Main" initial={{ y: -10 }} animate={{ y: 0 }} exit={{ y: -10 }} transition={{ duration: 0.25, ease: EASE }}>
              {[...NAV_LINKS, { label: 'Get started', href: APP_HREF }].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block border-b border-line py-4 text-[20px] font-semibold tracking-[-0.03em]"
                >
                  {link.label}
                </a>
              ))}
              <GitHubStarButton label="Star on GitHub" className="mt-6 h-12 w-full justify-center" />
              <InstallControl className="mt-4 h-12 w-full justify-center rounded-xl bg-subtle" />
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// footer
function FooterColumn({ title, links }: { title: string; links: { label: string; href: string; external?: boolean }[] }) {
  return (
    <div>
      <p className="text-[14px] text-ink/45">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})} className="text-[15px] font-medium transition-colors hover:text-ink/60">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const ref = useRef<HTMLElement>(null);

  // only once scrolled down to the footer, so pulling down at the top to refresh still shows the light page
  useEffect(() => {
    const root = document.documentElement;
    const update = () => root.classList.toggle('at-footer', window.scrollY > 0 && (ref.current?.getBoundingClientRect().top ?? Infinity) < window.innerHeight);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.classList.remove('at-footer');
    };
  }, []);

  return (
    <footer ref={ref} className="theme-dark relative overflow-hidden bg-canvas pt-20">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-4 lg:col-span-1">
          <Logo />
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-ink/55">
            Free, open-source PDF tools that run in your browser. For everyone who’s ever hit a PDF paywall.
          </p>
        </div>
        {/* every tool, so search engines find them all from any page */}
        {TOOL_GROUPS.map((group) => (
          <FooterColumn
            key={group}
            title={group}
            links={TOOLS.filter((tool) => tool.group === group).map((tool) => ({ label: tool.name, href: toolHref(tool.id) }))}
          />
        ))}
        <FooterColumn
          title="Product"
          links={[
            { label: 'All tools', href: APP_HREF },
            { label: 'Privacy', href: '/privacy' },
            { label: 'FAQ', href: '/#faq' },
          ]}
        />
        <FooterColumn
          title="Open source"
          links={[
            { label: 'GitHub', href: GITHUB_URL, external: true },
            { label: 'Report an issue', href: '/report' },
            { label: 'Contribute', href: GITHUB_URL, external: true },
          ]}
        />
      </div>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 border-t border-line px-4 py-6 text-[13px] text-ink/45 sm:flex-row sm:justify-between sm:px-6">
        <span>© {new Date().getFullYear()} snappdf.</span>
        <span>
          Built by{' '}
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer" className="font-medium text-ink/70 transition-colors hover:text-ink">
            Abraham Folorunso
          </a>
        </span>
      </div>
      <div aria-hidden="true" className="mx-auto flex max-w-6xl items-end gap-[3vw] px-4 pb-6 text-ink/[0.07] sm:px-6">
        <LogoMark className="h-[15vw] max-h-48 shrink-0" />
        <span className="text-[19vw] font-semibold leading-[0.72] tracking-[-0.07em] lg:text-[230px]">snappdf</span>
      </div>
    </footer>
  );
}

// a plain page with the site nav and footer, laid out like the landing page
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-canvas">
      <div className="theme-light relative z-10 rounded-b-[32px] bg-canvas sm:rounded-b-[48px]">
        <SiteNav />
        <main className="pt-20">{children}</main>
      </div>
      <div className="-mt-12">
        <SiteFooter />
      </div>
    </div>
  );
}
