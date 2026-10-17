import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Crop, Download, ImagePlus, RotateCw, Trash2 } from 'lucide-react';
import { AccountModal } from '@/src/components/AccountModal';
import { GitHubMark, Logo, LogoMark } from '@/src/components/brand';
import { GitHubStarButton } from '@/src/components/GitHubStarButton';
import { PrivacyChip, ToolIcon } from '@/src/components/toolkit';
import { APP_HREF, toolHref } from '@/src/lib/router';
import { getTool, GITHUB_URL } from '@/src/lib/site';
import { cn } from '@/src/lib/utils';
import { FileBar } from '@/src/pages/landing/FileBar';
import { PrivacyShowcase } from '@/src/pages/landing/PrivacyShowcase';
import { PHOTOS, Thumb, ToolShowcase } from '@/src/pages/landing/ToolShowcase';
import '@/src/pages/landing/landing.css';

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

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

function ButtonLink({
  href,
  children,
  tone = 'dark',
  size = 'md',
  className,
  onClick,
}: {
  href?: string;
  children: ReactNode;
  tone?: 'dark' | 'light';
  size?: 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}) {
  const classes = cn(
    'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
    size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-9 px-4 text-[14px]',
    tone === 'dark' ? 'bg-ink text-canvas hover:bg-ink/85' : 'bg-subtle text-ink hover:bg-line',
    className,
  );
  return href ? (
    <a href={href} onClick={onClick} className={classes}>
      {children}
    </a>
  ) : (
    <button onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

function SectionHeading({ title, sub, className }: { title: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Reveal className={cn('mx-auto max-w-3xl text-center', className)}>
      <h2 className="text-[36px] font-semibold leading-[1.02] tracking-[-0.045em] text-balance sm:text-[56px]">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-ink/55 sm:text-[17px]">{sub}</p>}
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { label: 'Tools', href: '#tools' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'FAQ', href: '#faq' },
];

function Nav({ onAccount }: { onAccount: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-300',
        scrolled || menuOpen ? 'bg-canvas/85 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <a href="#/" aria-label="snappdf home" onClick={() => window.scrollTo({ top: 0 })} className="rounded-md">
          <Logo />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="rounded-md px-3 py-2 text-[14px] font-medium text-ink/70 transition-colors hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <GitHubStarButton className="hidden sm:inline-flex" />
          <button onClick={onAccount} className="hidden h-9 px-3 text-[14px] font-medium text-ink/70 transition-colors hover:text-ink md:block">
            Log in
          </button>
          <ButtonLink href={APP_HREF} className="hidden sm:inline-flex">
            Open app
          </ButtonLink>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="grid size-10 place-items-center md:hidden"
          >
            <span aria-hidden="true" className="relative block h-3 w-5">
              <span className={cn('absolute left-0 h-[2px] w-5 rounded-full bg-ink transition-transform duration-300', menuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0')} />
              <span className={cn('absolute left-0 h-[2px] w-5 rounded-full bg-ink transition-transform duration-300', menuOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-0')} />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden md:hidden"
          >
            <div className="px-4 pb-6 pt-2">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block border-b border-line py-4 text-[20px] font-semibold tracking-[-0.03em]"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-6 grid gap-2">
                <ButtonLink href={APP_HREF} size="lg">
                  Open app
                </ButtonLink>
                <ButtonLink
                  tone="light"
                  size="lg"
                  onClick={() => {
                    setMenuOpen(false);
                    onAccount();
                  }}
                >
                  Log in
                </ButtonLink>
                <GitHubStarButton label="Star on GitHub" className="h-12 justify-center" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

// Headline slot tiles: tiny illustrations on a 100×100 grid. The slot clips them to a squircle.

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

function PdfTile({ behind, children }: { behind?: ReactNode; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" className="block size-full">
      <rect width="100" height="100" fill="#f5402c" />
      {behind}
      <rect x="25" y="13" width="50" height="68" rx="6" fill="#fff" />
      {children}
      <rect x="15" y="62" width="30" height="15" rx="4.5" fill="#fff" stroke="#f5402c" strokeWidth="2" />
      <text x="30" y="72.6" textAnchor="middle" fontSize="10" fontWeight="700" fill="#f5402c" letterSpacing="0.3">
        PDF
      </text>
    </svg>
  );
}

function PdfLines({ from = 22, rows = [36, 30, 36, 24] }: { from?: number; rows?: number[] }) {
  return (
    <>
      <rect x="32" y={from} width="22" height="4" rx="2" fill="#0b0b0c" opacity="0.8" />
      {rows.map((w, i) => (
        <rect key={i} x="32" y={from + 9 + i * 7} width={w} height="3" rx="1.5" fill="#0b0b0c" opacity="0.14" />
      ))}
    </>
  );
}

function PdfPhotoTile() {
  const id = useSvgId();
  return (
    <PdfTile>
      <defs>
        <radialGradient id={id} cx="0.3" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#bdf0ff" />
          <stop offset="0.46" stopColor="#3f7bff" />
          <stop offset="1" stopColor="#0d1a44" />
        </radialGradient>
      </defs>
      <rect x="31" y="20" width="38" height="27" rx="3" fill={`url(#${id})`} />
      <rect x="31" y="52" width="38" height="3" rx="1.5" fill="#0b0b0c" opacity="0.14" />
      <rect x="49" y="59" width="20" height="3" rx="1.5" fill="#0b0b0c" opacity="0.14" />
    </PdfTile>
  );
}

function PdfTextTile() {
  return (
    <PdfTile>
      <PdfLines />
    </PdfTile>
  );
}

function PdfSignedTile() {
  return (
    <PdfTile>
      <PdfLines rows={[36, 30, 24]} />
      <path d="M50 66c3-6 5-9 7-8s-2 10 0 10 4-8 6-8-1 7 1 7 4-5 6-5" fill="none" stroke="#0b0b0c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </PdfTile>
  );
}

function PdfStackTile() {
  return (
    <PdfTile behind={<rect x="31" y="8" width="50" height="68" rx="6" fill="#fff" opacity="0.55" />}>
      <PdfLines />
    </PdfTile>
  );
}

type Tile = () => ReactNode;

const PDF_TILES: Tile[] = [PdfTextTile, PdfPhotoTile, PdfSignedTile, PdfStackTile];

const SWAP_EVERY = 2600;

const TILE_VARIANTS = {
  shown: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { type: 'spring', duration: 0.55, bounce: 0.35 } },
  hidden: { opacity: 0, scale: 0.78, filter: 'blur(7px)', transition: { duration: 0.22, ease: 'easeOut' } },
} as const;

// Sits in the headline in place of a space, opens once its line has landed, then cycles through
// its tiles on a timer. Clicking skips to the next tile (and restarts the countdown).
function HeadlineSlot({ tiles, delay, offset = 0 }: { tiles: Tile[]; delay: number; offset?: number }) {
  const [index, setIndex] = useState(0);
  const [mountedAt] = useState(() => performance.now());
  const reduceMotion = useReducedMotion();
  const next = () => setIndex((i) => (i + 1) % tiles.length);

  useEffect(() => {
    if (reduceMotion) return;
    const untilFirstSwap = delay + offset + SWAP_EVERY - (performance.now() - mountedAt);
    const id = setTimeout(next, Math.max(SWAP_EVERY, untilFirstSwap));
    return () => clearTimeout(id);
  }, [index, reduceMotion]);

  return (
    <span className="hero-slot" style={{ animationDelay: `${delay}ms` }}>
      <span className="hero-slot-inner" style={{ animationDelay: `${delay + 90}ms` }} onClick={next}>
        {tiles.map((TileArt, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={i === index ? 'shown' : 'hidden'}
            variants={TILE_VARIANTS}
            className="absolute inset-0 overflow-hidden rounded-[30%] after:pointer-events-none after:absolute after:inset-0 after:rounded-[30%] after:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
          >
            <TileArt />
          </motion.span>
        ))}
      </span>
    </span>
  );
}

const HEADLINE_VARS = {
  '--icon-size': '0.85em',
  '--icon-drop': '0.075em',
  '--icon-gap': '0.2em',
  // Width of one space in the headline (Geist 600, including the -0.05em tracking), so a closed
  // slot reads exactly like the space it replaces.
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

// A still of the Image to PDF editor mid-job, framed like a product shot and cropped by its frame.
function HeroPreview() {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.5, ease: EASE }}
      className="mx-auto mt-14 max-w-6xl px-4 sm:mt-20 sm:px-6"
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
                    <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-[14px] bg-subtle p-2">
                      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[6px]">
                        <Thumb art={p.art} desk={p.desk} r={p.r} />
                      </span>
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

function Hero({ onAccount }: { onAccount: () => void }) {
  return (
    <section className="relative overflow-hidden pb-20 pt-28 sm:pb-28 sm:pt-36 lg:pt-40">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <h1
          aria-label="The ultimate PDF workspace. Zero paywalls."
          style={HEADLINE_VARS}
          className="mx-auto whitespace-nowrap text-[length:min(40px,10.5vw)] font-semibold leading-[1.05] tracking-[-0.05em] sm:text-[56px] lg:text-[72px] xl:text-[80px]"
        >
          <HeadlineLine delay={0.06}>The ultimate</HeadlineLine>
          <HeadlineLine delay={0.14}>
            PDF<HeadlineSlot tiles={PDF_TILES} delay={1060} />workspace.
          </HeadlineLine>
          <HeadlineLine delay={0.22}>
            <span className="hero-mark">
              Zero paywalls.
              <span aria-hidden="true" className="hero-mark-handle is-start" />
              <span aria-hidden="true" className="hero-mark-handle is-end" />
            </span>
          </HeadlineLine>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
          className="mx-auto mt-6 max-w-2xl text-balance text-[17px] leading-relaxed text-ink/60 sm:mt-8 sm:text-[20px]"
        >
          <span className="sm:block">Everything you need to edit, convert, and manage PDFs.</span>{' '}
          <span className="sm:block">Fast, private, and watermark-free.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.38, ease: EASE }}
          className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:mt-10 sm:flex-row"
        >
          <ButtonLink href={APP_HREF} size="lg" className="w-full sm:w-auto">
            Start editing, it’s free
          </ButtonLink>
          <ButtonLink tone="light" size="lg" onClick={onAccount} className="w-full gap-2 sm:w-auto">
            Create an account
            <ArrowRight size={16} aria-hidden="true" />
          </ButtonLink>
        </motion.div>
      </div>

      <HeroPreview />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Two ways to use it
// ---------------------------------------------------------------------------

function Bullets({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="space-y-3.5">
      {items.map((item) => (
        <li key={item} className="flex items-baseline gap-3 text-[15px]">
          <span aria-hidden="true" className={cn('size-1.5 shrink-0 translate-y-[-2px] rounded-full', dot)} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Modes({ onAccount }: { onAccount: () => void }) {
  return (
    <section id="modes" className="scroll-mt-16 pb-24 sm:pb-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading title="Use it once, or make it yours" sub="Jump into a quick edit with nothing to sign up for, or create a free account when you want your work to stick around." />
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <Reveal>
            <div className="theme-dark flex h-full flex-col rounded-[28px] bg-canvas p-8 sm:p-10">
              <span className="w-fit rounded-[7px] bg-lime px-2 py-0.5 text-[12px] font-semibold text-black">Available now</span>
              <h3 className="mt-10 text-[32px] font-semibold tracking-[-0.04em]">Quick edit</h3>
              <p className="mt-1 text-[16px] text-ink/55">For the thirty-second job.</p>
              <div className="mt-8 flex-1 border-t border-line pt-8 text-ink/85">
                <Bullets dot="bg-lime" items={['No sign-up, no email, no password', 'Files never leave your device', 'Everything clears when you close the tab or clear your browser']} />
              </div>
              <ButtonLink href={APP_HREF} size="lg" className="mt-10 w-full">
                Start editing
              </ButtonLink>
            </div>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="flex h-full flex-col rounded-[28px] bg-subtle p-8 sm:p-10">
              <span className="w-fit rounded-[7px] bg-card px-2 py-0.5 text-[12px] font-semibold text-ink/60 ring-1 ring-black/[0.06]">Coming soon</span>
              <h3 className="mt-10 text-[32px] font-semibold tracking-[-0.04em]">Free account</h3>
              <p className="mt-1 text-[16px] text-ink/55">For the work you come back to.</p>
              <div className="mt-8 flex-1 border-t border-line pt-8 text-ink/85">
                <Bullets dot="bg-ink" items={['Saved documents and history', 'Reusable signatures', 'Pick up where you left off, on any device']} />
              </div>
              <ButtonLink size="lg" onClick={onAccount} className="mt-10 w-full">
                Create a free account
              </ButtonLink>
            </div>
          </Reveal>
        </div>
        <Reveal>
          <p className="mt-6 text-center text-[14px] text-ink/45">Both are free. Both stay free.</p>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Open source
// ---------------------------------------------------------------------------

function OpenSource() {
  return (
    <section id="github" className="scroll-mt-16 pb-24 sm:pb-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="theme-dark grid gap-12 overflow-hidden rounded-[32px] bg-canvas p-8 sm:p-12 lg:grid-cols-2 lg:items-center lg:p-16">
            <div>
              <GitHubMark className="size-9" />
              <h2 className="mt-8 text-[36px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[52px]">Built in the open</h2>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink/60">
                snappdf is free because it’s open source. Read every line, report a bug, or build the next tool yourself.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <GitHubStarButton label="Star on GitHub" tone="dark" className="h-12 px-5 text-[15px]" />
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="px-3 py-3 text-[15px] font-medium text-ink/70 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink">
                  Contribute
                </a>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-card font-mono text-[12px] ring-1 ring-line sm:text-[13px]">
              <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
                <span className="size-2.5 rounded-full bg-ink/15" />
                <span className="size-2.5 rounded-full bg-ink/15" />
                <span className="size-2.5 rounded-full bg-ink/15" />
              </div>
              <pre className="overflow-x-auto p-5 leading-7 text-ink/80">
                <code>
                  <span className="text-ink/30">$ </span>git clone {GITHUB_URL}
                  {'\n'}
                  <span className="text-ink/30">$ </span>cd snappdf && npm install
                  {'\n'}
                  <span className="text-ink/30">$ </span>npm run dev
                  {'\n'}
                  <span className="text-lime">ready </span>
                  <span className="text-ink/50">on</span> http://localhost:3000
                </code>
              </pre>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const FAQS: { q: string; a: ReactNode }[] = [
  { q: 'Is snappdf really free?', a: 'Yes. No trials, no watermarks, no premium tier. It’s open source, so it stays that way.' },
  { q: 'Are my files uploaded anywhere?', a: 'No. Every tool runs inside your browser, so your files never leave your device.' },
  {
    q: 'What happens to my files in quick edit?',
    a: 'They live only in your current browser tab. Refresh, close the tab or clear your browser data and they’re gone, so download your result before you leave.',
  },
  {
    q: 'Why would I create an account?',
    a: 'To keep documents, signatures and history saved between visits and across devices. Accounts are optional, free, and coming soon.',
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

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

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
        <span>© {new Date().getFullYear()} snappdf. Free forever.</span>
        <span>Your files are processed on your device.</span>
      </div>
      <div aria-hidden="true" className="mx-auto flex max-w-6xl items-end gap-[3vw] px-4 pb-6 text-ink/[0.07] sm:px-6">
        <LogoMark className="h-[15vw] max-h-48 shrink-0" />
        <span className="text-[19vw] font-semibold leading-[0.72] tracking-[-0.07em] lg:text-[230px]">snappdf</span>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------

export default function Landing() {
  const [accountOpen, setAccountOpen] = useState(false);
  const openAccount = () => setAccountOpen(true);

  // Warm up the (heavy) workspace bundle so "Start editing" feels instant.
  useEffect(() => {
    const id = setTimeout(() => void import('@/src/pages/Workspace'), 1500);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-canvas">
      <div className="theme-light relative z-10 rounded-b-[32px] bg-canvas sm:rounded-b-[48px]">
        <Nav onAccount={openAccount} />
        <main className="lp">
          <Hero onAccount={openAccount} />
          <FileBar />
          <ToolShowcase />
          <Modes onAccount={openAccount} />
          <PrivacyShowcase />
          <OpenSource />
          <Faq />
        </main>
      </div>
      <div className="-mt-12">
        <Footer />
      </div>
      <div className="theme-light">
        <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      </div>
    </div>
  );
}
