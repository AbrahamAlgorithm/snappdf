import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Crop, Download, ImagePlus, RotateCw, Trash2 } from 'lucide-react';
import { Logo, LogoMark } from '@/components/brand';
import { GitHubStarButton } from '@/components/GitHubStarButton';
import { PrivacyChip, ToolIcon } from '@/components/toolkit';
import { APP_HREF, toolHref } from '@/lib/router';
import { getTool, GITHUB_URL } from '@/lib/site';
import { cn } from '@/lib/utils';
import { FileBar } from '@/pages/landing/FileBar';
import { PrivacyShowcase } from '@/pages/landing/PrivacyShowcase';
import { PHOTOS, ToolShowcase } from '@/pages/landing/ToolShowcase';
import '@/pages/landing/landing.css';

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

// fade up on scroll
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// nav
const NAV_LINKS = [
  { label: 'Tools', href: '#tools' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'FAQ', href: '#faq' },
];

function Nav() {
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
          <a href="/" aria-label="snappdf home" onClick={() => window.scrollTo({ top: 0 })} className="flex h-11 items-center rounded-md">
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
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// hero
function PdfIcon() {
  return (
    <svg viewBox="0 0 100 100" className="block size-full">
      <rect width="100" height="100" fill="#f5402c" />
      <rect x="25" y="13" width="50" height="68" rx="6" fill="#fff" />
      <rect x="32" y="22" width="22" height="4" rx="2" fill="#0b0b0c" opacity="0.8" />
      {[36, 30, 36, 24].map((w, i) => (
        <rect key={i} x="32" y={31 + i * 7} width={w} height="3" rx="1.5" fill="#0b0b0c" opacity="0.14" />
      ))}
      <rect x="15" y="62" width="30" height="15" rx="4.5" fill="#fff" stroke="#f5402c" strokeWidth="2" />
      <text x="30" y="72.6" textAnchor="middle" fontSize="10" fontWeight="700" fill="#f5402c" letterSpacing="0.3">
        PDF
      </text>
    </svg>
  );
}

function Smiley() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="hero-smile">
      <circle cx="50" cy="50" r="44" fill="#fff" stroke="currentColor" strokeWidth="10" />
      <circle cx="35" cy="36" r="7" fill="currentColor" />
      <circle cx="65" cy="36" r="7" fill="currentColor" />
      <path d="M27 52h46a3 3 0 0 1 3 3c0 14-11.6 25-26 25S24 69 24 55a3 3 0 0 1 3-3z" fill="currentColor" />
    </svg>
  );
}

// stands in for a space in the headline, then opens up to fit the icon
function HeadlineSlot({ delay, children }: { delay: number; children: ReactNode }) {
  return (
    <span className="hero-slot" style={{ animationDelay: `${delay}ms` }}>
      <span className="hero-slot-inner" style={{ animationDelay: `${delay + 90}ms` }}>
        <span className="absolute inset-0 overflow-hidden rounded-[30%] after:pointer-events-none after:absolute after:inset-0 after:rounded-[30%] after:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          {children}
        </span>
      </span>
    </span>
  );
}

const HEADLINE_VARS = {
  '--icon-size': '0.85em',
  '--icon-drop': '0.075em',
  '--icon-gap': '0.2em',
  // width of one space, so a closed slot looks like a normal space
  '--slot-closed': '0.2055em',
  '--slot-open': 'calc(var(--icon-size) + 2 * var(--icon-gap))',
} as CSSProperties;

function HeadlineLine({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <motion.span
      aria-hidden="true"
      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      className="block"
    >
      {children}
    </motion.span>
  );
}

const PREVIEW_TOOL = getTool('image-to-pdf');

// mock of the image to pdf editor
function HeroPreview() {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.5, ease: EASE }}
      className="mx-auto mt-10 max-w-6xl px-4 sm:mt-20 sm:px-6"
    >
      <div className="h-[460px] overflow-hidden rounded-[28px] bg-[#e9e9ec] px-2.5 pt-2.5 sm:h-[560px] sm:rounded-[40px] sm:px-6 sm:pt-6 lg:h-[620px] lg:px-10 lg:pt-10">
        <div className="flex h-full flex-col overflow-hidden rounded-t-[20px] bg-subtle text-left shadow-[0_0_0_1px_rgba(0,0,0,0.05)] sm:rounded-t-[28px]">
          <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-canvas px-2 sm:h-16 sm:px-4">
            <span className="grid size-10 place-items-center text-ink/70">
              <ArrowLeft size={20} />
            </span>
            <ToolIcon tool={PREVIEW_TOOL} size="sm" className="ml-1" />
            <span className="ml-2.5 text-[16px] font-semibold tracking-[-0.02em] sm:text-[17px]">{PREVIEW_TOOL.name}</span>
            <PrivacyChip className="ml-auto hidden sm:inline-flex" />
          </div>

          <div className="flex min-h-0 flex-1 gap-5 p-3 sm:p-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-end justify-between gap-3 px-1 pb-4 pt-1">
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.02em] sm:text-[20px]">{PHOTOS.length} images</p>
                  <p className="mt-0.5 text-[13px] text-ink/55 sm:text-[14px]">Drag to change the page order.</p>
                </div>
                <span className="hidden h-10 items-center gap-2 rounded-full border border-line bg-canvas px-5 text-[14px] font-medium sm:inline-flex">
                  <ImagePlus size={18} />
                  Add images
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PHOTOS.map((p, i) => (
                  <div key={p.name} className="rounded-[20px] bg-canvas p-2">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-subtle">
                      <img src={p.src} alt="" loading="lazy" decoding="async" className="size-full object-contain p-2" />
                      <span className="absolute left-2 top-2 min-w-6 rounded-full bg-ink px-2 py-0.5 text-center text-[12px] font-medium tabular-nums text-canvas">
                        {i + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 px-1.5 pb-1 pt-2.5 text-ink/55">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink/65">{p.name}</span>
                      <RotateCw size={15} className="hidden shrink-0 md:block" />
                      <Crop size={15} className="hidden shrink-0 md:block" />
                      <Trash2 size={15} className="hidden shrink-0 md:block" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden w-[300px] shrink-0 flex-col self-start rounded-[24px] bg-canvas p-5 lg:flex">
              <p className="text-[16px] font-semibold tracking-[-0.01em]">PDF settings</p>
              <div className="mt-5 flex justify-between text-[14px]">
                <span className="font-medium">Image quality</span>
                <span className="text-ink/60">85%</span>
              </div>
              <span className="relative mt-4 block h-1 rounded-full bg-line">
                <span className="absolute inset-y-0 left-0 w-[85%] rounded-full bg-ink" />
                <span className="absolute left-[85%] top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-4 ring-canvas" />
              </span>
              <span className="mt-2.5 flex justify-between text-[12px] text-ink/45">
                <span>Smaller file</span>
                <span>Sharper</span>
              </span>
              <span className="mt-6 grid gap-2.5 border-t border-line pt-5 text-[14px]">
                {[
                  ['Pages', String(PHOTOS.length)],
                  ['Page size', 'A4, portrait'],
                  ['Original size', '11.3 MB'],
                  ['Estimated PDF', 'about 6.7 MB'],
                ].map(([k, v]) => (
                  <span key={k} className="flex justify-between">
                    <span className="text-ink/55">{k}</span>
                    <span className="font-medium">{v}</span>
                  </span>
                ))}
              </span>
              <span className="mt-6 flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-canvas">
                <Download size={18} />
                Create PDF
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pb-28 sm:pt-36 lg:pt-40">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <h1
          aria-label="The ultimate PDF workspace. Zero paywalls"
          style={HEADLINE_VARS}
          className="mx-auto whitespace-nowrap text-[length:min(40px,10.5vw)] font-semibold leading-[1.05] tracking-[-0.05em] text-black sm:text-[56px] lg:text-[72px] xl:text-[80px]"
        >
          <HeadlineLine delay={0.06}>The ultimate</HeadlineLine>
          <HeadlineLine delay={0.14}>
            PDF
            <HeadlineSlot delay={1060}>
              <PdfIcon />
            </HeadlineSlot>
            workspace.
          </HeadlineLine>
          <HeadlineLine delay={0.22}>
            Zero paywalls
            <Smiley />
          </HeadlineLine>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
          className="mx-auto mt-6 max-w-[400px] text-balance sm:mt-10 text-[20px] font-[440] leading-[26px] text-ink/60 md:max-w-none"
        >
          <span className="md:block">Everything you need to edit, convert, and manage PDFs.</span>{' '}
          <span className="md:block">Fast, private, and watermark-free.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.38, ease: EASE }}
          className="mt-8 flex flex-wrap items-center justify-center gap-2.5 sm:mt-10"
        >
          <a
            href={APP_HREF}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-ink px-4 text-[14px] font-medium text-canvas transition-colors hover:bg-ink/85 max-[359px]:px-3 sm:h-12 sm:px-6 sm:text-[15px]"
          >
            Start for free
          </a>
          <GitHubStarButton label="View source" className="h-11 px-4 text-[14px] max-[359px]:px-3 sm:h-12 sm:px-6 sm:text-[15px]" />
        </motion.div>
      </div>

      <HeroPreview />
    </section>
  );
}

// faq
const FAQS: { q: string; a: ReactNode }[] = [
  { q: 'Is snappdf really free?', a: 'Yes. No trials, no watermarks, no premium tier. It’s open source, so it stays that way.' },
  { q: 'Are my files uploaded anywhere?', a: 'No. Every tool runs inside your browser, so your files never leave your device.' },
  {
    q: 'What happens to my files when I’m done?',
    a: 'They stay in your browser tab while you work, even if you switch between tools. Refresh or close the tab and they’re gone, so download your result before you leave.',
  },
  {
    q: 'Which file types are supported?',
    a: 'Images (JPG, PNG, HEIC, WEBP, GIF, BMP) to PDF, PDF to Word, CSV or JSON to Excel, JSON to CSV, and plain text to PDF. You can also split and sign any PDF.',
  },
  {
    q: 'Can I contribute?',
    a: (
      <>
        Please do. Issues and pull requests are welcome on{' '}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-ink/30 underline-offset-4">
          GitHub
        </a>
        .
      </>
    ),
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-16 pb-24 sm:pb-36">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <h2 className="text-[36px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[52px]">Frequently asked questions</h2>
        </Reveal>
        <Reveal delay={0.08} className="lg:col-span-7">
          <div className="divide-y divide-line border-y border-line">
            {FAQS.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q}>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left text-[17px] font-semibold tracking-[-0.02em]"
                  >
                    {item.q}
                    <span aria-hidden="true" className="relative size-3.5 shrink-0">
                      <span className="absolute left-0 top-1/2 h-[1.5px] w-3.5 -translate-y-1/2 rounded-full bg-ink" />
                      <span className={cn('absolute left-1/2 top-0 h-3.5 w-[1.5px] -translate-x-1/2 rounded-full bg-ink transition-transform duration-300', isOpen && 'scale-y-0')} />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-xl pb-6 text-[15px] leading-relaxed text-ink/60">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
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

function Footer() {
  return (
    <footer className="theme-dark relative overflow-hidden bg-canvas pt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-ink/55">
            Free, open-source PDF tools that run in your browser. For everyone who’s ever hit a PDF paywall.
          </p>
        </div>
        <FooterColumn
          title="Tools"
          links={[
            { label: 'All tools', href: APP_HREF },
            { label: 'Image to PDF', href: toolHref('image-to-pdf') },
            { label: 'Split PDF', href: toolHref('pdf-splitter') },
            { label: 'Sign PDF', href: toolHref('sign-pdf') },
            { label: 'PDF to Word', href: toolHref('pdf-to-word') },
          ]}
        />
        <FooterColumn
          title="Product"
          links={[
            { label: 'Privacy', href: '#privacy' },
            { label: 'FAQ', href: '#faq' },
          ]}
        />
        <FooterColumn
          title="Open source"
          links={[
            { label: 'GitHub', href: GITHUB_URL, external: true },
            { label: 'Report an issue', href: `${GITHUB_URL}/issues`, external: true },
            { label: 'Contribute', href: GITHUB_URL, external: true },
          ]}
        />
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-line px-4 py-6 text-[13px] text-ink/45 sm:flex-row sm:justify-between sm:px-6">
        <span>© {new Date().getFullYear()} snappdf.</span>
        <span className="hidden sm:inline">Your files are processed on your device.</span>
      </div>
      <div aria-hidden="true" className="mx-auto flex max-w-6xl items-end gap-[3vw] px-4 pb-6 text-ink/[0.07] sm:px-6">
        <LogoMark className="h-[15vw] max-h-48 shrink-0" />
        <span className="text-[19vw] font-semibold leading-[0.72] tracking-[-0.07em] lg:text-[230px]">snappdf</span>
      </div>
    </footer>
  );
}

export default function Landing() {
  // preload the editors so tools open fast
  useEffect(() => {
    const id = setTimeout(() => void import('@/pages/Workspace'), 1500);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-canvas">
      <div className="theme-light relative z-10 rounded-b-[32px] bg-canvas sm:rounded-b-[48px]">
        <Nav />
        <main className="lp">
          <Hero />
          <FileBar />
          <ToolShowcase />
          <PrivacyShowcase />
          <Faq />
        </main>
      </div>
      <div className="-mt-12">
        <Footer />
      </div>
    </div>
  );
}
