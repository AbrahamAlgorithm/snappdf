import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowLeftRight, ArrowRight, Check, FileImage, GripVertical, Minus, PenTool, Plus, RotateCw, Scissors, ShieldCheck } from 'lucide-react';
import businessDocument from '@/assets/landing/business-document.jpg'; // CC0, stocksnap.io/photo/business-document-AB4F938C85
import cafeReceipt from '@/assets/landing/cafe-receipt.jpg'; // CC0, stocksnap.io/photo/coffee-cafelatte-F9A95133A1
import letterClipboard from '@/assets/landing/letter-clipboard.jpg'; // CC0, stocksnap.io/photo/office-work-UP9J4EZYNJ
import parkingPermit from '@/assets/landing/parking-permit.jpg'; // CC0, flickr.com/photos/43296902@N00/14508511975
import paymentScreenshot from '@/assets/landing/payment-screenshot.jpg';
import receiptStack from '@/assets/landing/receipt-stack.jpg'; // CC0, rawpixel.com/image/5924546/receipts-table-free-public-domain-cc0-image
import statementA from '@/assets/landing/statement-a.jpg';
import statementB from '@/assets/landing/statement-b.jpg';
import statementC from '@/assets/landing/statement-c.jpg';
import statementCover from '@/assets/landing/statement-cover.jpg';
import { LogoMark } from '@/components/brand';
import { APP_HREF, toolHref } from '@/lib/router';
import { cn } from '@/lib/utils';
import { pad, SplitText, useInView, useTicker } from '@/pages/landing/motion';

// tool showcase, auto-plays each demo until someone picks a tool

const TOOLS = [
  {
    id: 'image-to-pdf',
    tab: 'Images to PDF',
    icon: FileImage,
    c: '#e8590c',
    desc: 'Turn photos, screenshots and iPhone HEIC files into one clean PDF, in the order you choose.',
    points: ['HEIC photos converted for you', 'Drag to reorder, rotate or crop any page', 'Pick the quality and the file size'],
    file: 'receipts-march.pdf',
    cta: 'Turn images into a PDF',
    href: toolHref('image-to-pdf'),
  },
  {
    id: 'sign-pdf',
    tab: 'Sign documents',
    icon: PenTool,
    c: '#1d8348',
    desc: 'Draw or upload your signature and place it on any page, at the size you need.',
    points: ['Draw with a finger, mouse or trackpad', 'Resize, rotate and clear white backgrounds', 'Add as many signatures as you need'],
    file: 'tenancy-agreement.pdf',
    cta: 'Sign a document',
    href: toolHref('sign-pdf'),
  },
  {
    id: 'pdf-splitter',
    tab: 'Split and extract',
    icon: Scissors,
    c: '#2f6fed',
    desc: 'Preview every page, pick the ones you need and save them as a new PDF.',
    points: ['Pick pages one by one or as a range', 'Full-size preview of any page', 'Pages copied as they are, no quality loss'],
    file: 'statement-q1.pdf',
    cta: 'Split a PDF',
    href: toolHref('pdf-splitter'),
  },
  {
    id: 'converter',
    tab: 'Convert files',
    icon: ArrowLeftRight,
    c: '#7c3aed',
    desc: 'PDF to Word, spreadsheets to Excel, and plain text to PDF.',
    points: ['PDF text into an editable Word file', 'CSV or JSON to Excel, JSON to CSV', 'Text files into tidy PDFs'],
    file: 'q3-report.pdf',
    cta: 'Convert a file',
    href: APP_HREF,
  },
] as const;

type ToolKey = (typeof TOOLS)[number]['id'];

// same order as the real app
const RAIL: { id: ToolKey; icon: typeof FileImage }[] = [
  { id: 'image-to-pdf', icon: FileImage },
  { id: 'pdf-splitter', icon: Scissors },
  { id: 'converter', icon: ArrowLeftRight },
  { id: 'sign-pdf', icon: PenTool },
];

// window width before it's scaled to fit, phones get a narrower one
const WIN_W = 720;
const WIN_W_NARROW = 480;

type ViewProps = { run: boolean; still: boolean };
type Tone = 'ok' | 'review' | 'none';

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="lp-pill" data-tone={tone}>
      {children}
    </span>
  );
}

function Head({ title, sub, pill, right }: { title: ReactNode; sub: ReactNode; pill?: ReactNode; right?: ReactNode }) {
  return (
    <div className="lp-head">
      <div className="min-w-0">
        <p className="lp-h">
          {title}
          {pill}
        </p>
        <p className="lp-sub">{sub}</p>
      </div>
      {right}
    </div>
  );
}

function Done({ title, note }: { title: string; note: string }) {
  return (
    <div className="lp-done">
      <Check />
      <span>
        <b>{title}</b>
        <em>{note}</em>
      </span>
    </div>
  );
}

// images to pdf demo

export const PHOTOS: { name: string; size: string; src: string; fit?: 'contain'; heic?: number }[] = [
  { name: 'IMG_2041.HEIC', size: '2.1 MB', src: cafeReceipt, heic: 0 },
  { name: 'IMG_2042.HEIC', size: '1.8 MB', src: receiptStack, heic: 1 },
  { name: 'Screenshot 09.41.png', size: '640 KB', src: paymentScreenshot, fit: 'contain' },
  { name: 'IMG_2043.JPG', size: '3.4 MB', src: letterClipboard },
  { name: 'parking.webp', size: '410 KB', src: parkingPermit },
  { name: 'IMG_2045.JPG', size: '2.9 MB', src: businessDocument },
];

const CONVERT_STEPS = [12, 34, 58, 81, 100];

function ImagesView({ run, still }: ViewProps) {
  const tick = useTicker(run, 500);
  const t = still ? 99 : tick;
  const building = t >= 7 && t < 13;
  const page = Math.min(6, Math.max(1, t - 6));
  const saved = t >= 13;
  return (
    <>
      <Head
        title="Expense receipts, March"
        sub="A4 · Portrait · Quality 85%"
        pill={<Pill tone="none">6 images</Pill>}
        right={
          <span className="lp-count">
            <em>Estimated size</em>
            2.4 MB
          </span>
        }
      />
      <div className="ts-cards">
        {PHOTOS.map((p, i) => {
          const step = p.heic === undefined ? undefined : CONVERT_STEPS[t - p.heic];
          const converting = p.heic !== undefined && t - p.heic < CONVERT_STEPS.length;
          return (
            <div key={p.name} className={cn('ts-card', building && i + 1 === page && 'is-now')}>
              <span className="ts-card-art">
                <img src={p.src} alt="" loading="lazy" decoding="async" className={cn('ts-photo', p.fit === 'contain' && 'is-contain')} />
                <span className="ts-num">{pad(i + 1)}</span>
                {converting && (
                  <span className="ts-heic">
                    <em>Converting HEIC · {step ?? 0}%</em>
                    <span>
                      <b style={{ width: `${step ?? 0}%` }} />
                    </span>
                  </span>
                )}
              </span>
              <span className="ts-meta">
                <b>{p.name}</b>
                <em>{p.size}</em>
              </span>
            </div>
          );
        })}
      </div>
      <div className="ts-foot">
        {saved ? (
          <Done title="receipts-march.pdf saved" note="6 pages · 2.4 MB · straight to your downloads" />
        ) : building ? (
          <span className="ts-build">
            <em>
              Building your PDF · page {page} of 6
            </em>
            <span>
              <b style={{ width: `${(page / 6) * 100}%` }} />
            </span>
          </span>
        ) : (
          <span className="ts-hint">
            <GripVertical />
            Drag to reorder · tap a page to rotate or crop
          </span>
        )}
        <span className={cn('lp-btn', t >= 6 && 'is-on', saved && 'is-done')}>{saved ? 'Saved' : 'Generate PDF'}</span>
      </div>
    </>
  );
}

// sign demo

const SIG_PATH =
  'M6 40C14 22 22 10 30 12s-6 34-2 34 14-30 22-30-4 24 2 24 10-18 18-18 0 16 8 16 12-20 20-20 2 16 10 16 14-14 22-14 6 10 14 10 18-10 30-14M24 52c46-6 104-8 168-12';

const LANDLORD_PATH =
  'M10 44c6-16 14-30 22-28 7 2-8 30-2 30 8 0 16-30 26-30 6 0-4 24 4 24s12-20 20-20c6 0 2 14 8 14 9 0 12-12 22-12s4 10 12 10M36 30c30 2 70 0 128-6';

function Signature({ progress = 1, path = SIG_PATH, className }: { progress?: number; path?: string; className?: string }) {
  return (
    <svg viewBox="0 0 200 60" fill="none" aria-hidden="true" className={className}>
      <path d={path} pathLength={1} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" strokeDashoffset={1 - progress} />
    </svg>
  );
}

function SignView({ run, still }: ViewProps) {
  const tick = useTicker(run, 120);
  const t = still ? 999 : tick;
  const drawn = Math.min(1, Math.max(0, (t - 5) / 22));
  const onPage = t >= 30;
  const placed = t >= 33;
  const ready = t >= 37;
  const saved = t >= 47;
  return (
    <>
      <Head
        title="Tenancy agreement"
        sub="tenancy-agreement.pdf · 1.2 MB · 4 pages"
        pill={<Pill tone="none">Page 4 of 4</Pill>}
        right={
          <span className="ts-zoom">
            <Minus />
            100%
            <Plus />
          </span>
        }
      />
      <div className="ts-sign">
        <div className="ts-canvas">
          <div className="ts-page">
            <p className="ts-page-h">11. Ending the tenancy</p>
            <p className="ts-page-p">
              Either party may end this agreement by giving at least two months’ notice in writing. At the end of the tenancy the
              Tenant must leave the Property clean, in good repair and free of their belongings, allowing for fair wear and tear.
            </p>
            <p className="ts-page-h">12. Keys and access</p>
            <p className="ts-page-p">
              The Tenant will receive two sets of keys and must return every set on the last day of the tenancy. The Landlord may
              visit the Property with at least 24 hours’ notice, except in an emergency.
            </p>
            <p className="ts-page-h">13. Signatures</p>
            <p className="ts-page-p">By signing below, the Landlord and the Tenant agree to the terms on pages 1 to 4 of this agreement.</p>
            <div className="ts-sigs">
              <div className="ts-sigline">
                <Signature path={LANDLORD_PATH} className="ts-sig-done" />
                <span>Landlord · signed 12 Mar</span>
              </div>
              <div className={cn('ts-sigline is-target', onPage && 'is-sel')}>
                {onPage ? <Signature className="ts-sig-ink ts-landed" /> : <span className="ts-ask">Click to sign here</span>}
                {onPage && (
                  <>
                    <i className="ts-h1" />
                    <i className="ts-h2" />
                    <i className="ts-h3" />
                    <i className="ts-h4" />
                    <span className="ts-tool">
                      <Minus />
                      26% W
                      <Plus />
                      <s />
                      <RotateCw />
                      <s />
                      Clear BG
                      <s />
                      <b>Done</b>
                    </span>
                  </>
                )}
                <span>Tenant</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ts-panel">
          <p className="lp-label">Signature</p>
          <div className="ts-sigbox">
            {t < 5 && <span className="ts-sigbox-hint">Sign here</span>}
            <Signature progress={drawn} className="ts-sig-ink" />
          </div>
          <div className="ts-seg">
            <span className="is-on">Draw</span>
            <span>Upload</span>
          </div>
          <p className="lp-label">Placed ({placed ? 1 : 0})</p>
          {placed ? (
            <div className="ts-placed">
              <span className="ts-placed-art">
                <Signature className="ts-sig-ink" />
              </span>
              <b>Signature 1</b>
              <em>P.4</em>
              <em>26%</em>
            </div>
          ) : (
            <div className="ts-empty">No signatures placed yet</div>
          )}
          <div className="ts-panel-foot">
            {saved ? (
              <Done title="Signed copy saved" note="tenancy-agreement-signed.pdf" />
            ) : (
              <span className={cn('lp-btn ts-wide', ready && 'is-on')}>Download signed PDF</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// split demo

const STATEMENT_PAGES = [statementA, statementB, statementC];

function SplitView({ run, still }: ViewProps) {
  const tick = useTicker(run, 520);
  const t = still ? 99 : tick;
  const order = [...(t >= 3 ? [3, 4, 5] : []), ...(t >= 6 ? [9] : [])];
  const ready = t >= 8;
  const saved = t >= 11;
  return (
    <>
      <Head
        title="Bank statement, Q1"
        sub="statement-q1.pdf · 4.8 MB"
        pill={<Pill tone="none">12 pages</Pill>}
        right={
          <span className="ts-range">
            <em>Pages</em>
            <span>3</span>
            <em>to</em>
            <span>5</span>
            <b className={cn(t === 2 && 'is-press')}>Add</b>
          </span>
        }
      />
      <div className="ts-pages">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
          const pos = order.indexOf(n);
          return (
            <div key={n} className={cn('ts-pg', pos >= 0 && 'is-sel')}>
              <span className="ts-pg-art">
                <img src={n === 1 ? statementCover : STATEMENT_PAGES[(n - 2) % STATEMENT_PAGES.length]} alt="" loading="lazy" decoding="async" />
              </span>
              {pos >= 0 && <span className="ts-pg-badge">{pos + 1}</span>}
              <span className="ts-pg-n">{n}</span>
            </div>
          );
        })}
      </div>
      <div className="ts-foot">
        {saved ? (
          <Done title="statement-q1-extract.pdf saved" note="4 pages · 1.6 MB · copied at full quality" />
        ) : (
          <span className="ts-chips">
            <em>{order.length ? `${order.length} selected` : 'No pages selected'}</em>
            {order.map((n) => (
              <b key={n}>{n}</b>
            ))}
          </span>
        )}
        <span className={cn('lp-btn', ready && 'is-on', saved && 'is-done')}>{saved ? 'Saved' : order.length ? `Extract ${order.length} pages` : 'Extract pages'}</span>
      </div>
    </>
  );
}

// convert demo

const MODULES = [
  ['PDF to Word', 'PDF → DOCX'],
  ['CSV to Excel', 'CSV → XLSX'],
  ['JSON to Excel', 'JSON → XLSX'],
  ['JSON to CSV', 'JSON → CSV'],
  ['Text to PDF', 'TXT → PDF'],
];

function ConvertView({ run, still }: ViewProps) {
  const tick = useTicker(run, 400);
  const t = still ? 99 : tick;
  const page = Math.min(12, Math.max(0, t - 2));
  const converting = t >= 2 && t < 15;
  const done = t >= 15;
  return (
    <>
      <Head title="Convert" sub="One file at a time, in this tab" pill={<Pill tone="none">5 formats</Pill>} />
      <div className="ts-conv">
        <div className="ts-mods">
          {MODULES.map(([name, fmt], i) => (
            <div key={name} className={cn('ts-mod', i === 0 && 'is-on')}>
              <b>{name}</b>
              <em>{fmt}</em>
            </div>
          ))}
        </div>
        <div className="ts-job">
          <div className="ts-file">
            <span className="ts-doc">
              <i />
              <i />
              <i className="w60" />
              <b>PDF</b>
            </span>
            <span className="ts-file-t">
              <b>Q3 report.pdf</b>
              <em>2.4 MB · 12 pages</em>
            </span>
            <Pill tone={done ? 'ok' : converting ? 'review' : 'none'}>{done ? 'Converted' : converting ? 'Converting' : 'Ready'}</Pill>
          </div>
          <div className="ts-fmts">
            <span>
              <em>From</em>
              PDF document
            </span>
            <ArrowRight />
            <span>
              <em>To</em>
              Word document (.docx)
            </span>
          </div>
          <div className="ts-read">
            <em>{done ? 'All 12 pages read' : converting ? `Reading page ${page} of 12` : 'Waiting to start'}</em>
            <span>
              <b style={{ width: `${(page / 12) * 100}%` }} />
            </span>
          </div>
          {done ? (
            <div className="ts-result">
              <span className="ts-doc is-word">
                <i />
                <i />
                <i className="w60" />
                <b>DOCX</b>
              </span>
              <span className="ts-file-t">
                <b>Q3 report.docx</b>
                <em>186 KB · converted in your browser</em>
              </span>
              <span className="lp-btn is-on">Download</span>
            </div>
          ) : (
            <span className={cn('lp-btn ts-wide', t >= 1 && !converting && 'is-on', converting && 'is-busy')}>{converting ? 'Converting…' : 'Start conversion'}</span>
          )}
        </div>
      </div>
    </>
  );
}

const VIEWS = { 'image-to-pdf': ImagesView, 'sign-pdf': SignView, 'pdf-splitter': SplitView, converter: ConvertView };

export function ToolShowcase() {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const onScreen = useInView(ref, { once: false, rootMargin: '0px' });
  const reduced = !!useReducedMotion();
  const [sel, setSel] = useState(0);
  const [auto, setAuto] = useState(true);
  const [held, setHeld] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const tool = TOOLS[sel];
  const View = VIEWS[tool.id];

  // scale the window to fit, a bit of it always runs off the right edge
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const small = el.clientWidth < 600;
      const ww = small ? WIN_W_NARROW : WIN_W;
      const left = small ? 18 : 40;
      el.style.setProperty('--ww', `${ww}px`);
      el.style.setProperty('--ws', Math.min(1, (el.clientWidth - left + 24) / ww).toFixed(4));
      el.style.setProperty('--left', `${left}px`);
      setNarrow(small);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pick = (i: number) => {
    setSel(i);
    setAuto(false);
  };
  const playing = auto && !reduced;

  return (
    <section
      id="tools"
      ref={ref}
      className={cn('ts scroll-mt-16', inView && 'is-in', held && 'is-held', !onScreen && 'is-away')}
      aria-labelledby="tools-title"
    >
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <h2 id="tools-title" className="text-[36px] font-semibold leading-[1.02] tracking-[-0.045em] text-balance sm:text-[56px]">
          <SplitText lines={[{ parts: [{ text: 'There’s a free tool' }, { text: 'for that', className: 'g' }] }]} />
        </h2>
        <p className="ent mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-ink/55 sm:text-[17px]" style={{ '--d': '200ms' } as CSSProperties}>
          The PDF jobs other apps put behind a paywall, in one workspace that runs in your browser.
        </p>
      </div>

      <div
        className="ts-grid mx-auto max-w-6xl px-4 sm:px-6"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        <div className="ts-side ent" style={{ '--d': '240ms' } as CSSProperties}>
          <div className="ts-list">
            {TOOLS.map((x, i) => {
              const on = i === sel;
              const Icon = x.icon;
              return (
                <div key={x.id} className={cn('ts-item', on && 'is-on')} style={{ '--c': x.c } as CSSProperties}>
                  <span className="ts-bar" aria-hidden="true">
                    {on && <i key={`${sel}-${playing}`} className={playing ? 'is-run' : ''} onAnimationEnd={() => setSel((s) => (s + 1) % TOOLS.length)} />}
                  </span>
                  <h3>
                    <button
                      type="button"
                      id={`ts-tab-${x.id}`}
                      className="ts-tab"
                      aria-expanded={on}
                      aria-controls={`ts-more-${x.id}`}
                      onClick={() => pick(i)}
                    >
                      <span className="ts-ico">
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="ts-name">{x.tab}</span>
                      <span className="ts-n">{pad(i + 1)}</span>
                    </button>
                  </h3>
                  <div id={`ts-more-${x.id}`} className="ts-more" role="region" aria-labelledby={`ts-tab-${x.id}`} inert={!on}>
                    <div>
                      <p>{x.desc}</p>
                      <ul>
                        {x.points.map((p) => (
                          <li key={p}>
                            <Check aria-hidden="true" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <a
            href={tool.href}
            className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-medium text-canvas transition-colors hover:bg-ink/85"
          >
            {tool.cta}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>

        <div
          ref={stageRef}
          className={cn('lp-stage ts-stage ent ent-scale', narrow && 'is-narrow')}
          style={{ '--d': '320ms' } as CSSProperties}
          aria-hidden="true"
        >
          {TOOLS.map((x, i) => (
            <span key={x.id} className={cn('lp-glow', i === sel && 'is-on')} style={{ '--c': x.c } as CSSProperties} />
          ))}
          <div className="lp-win" style={{ '--c': tool.c } as CSSProperties}>
            <div className="lp-chrome">
              <span className="lp-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="lp-crumb">
                Workspace
                <em>/</em>
                <b key={tool.id} className="lp-swap">
                  {tool.tab}
                </b>
                <em className="lp-mid">/</em>
                <span key={tool.file} className="lp-swap lp-mid">
                  {tool.file}
                </span>
              </span>
              <span key={`as-${tool.id}`} className="lp-as lp-swap">
                <ShieldCheck />
                On this device
              </span>
            </div>
            <div className="ts-app">
              <span className="ts-rail">
                <span className="ts-logo">
                  <LogoMark className="h-[13px]" />
                </span>
                {RAIL.map(({ id, icon: Icon }) => (
                  <span key={id} className={cn(id === tool.id && 'is-on')} style={id === tool.id ? ({ '--c': tool.c } as CSSProperties) : undefined}>
                    <Icon />
                  </span>
                ))}
              </span>
              <div key={tool.id} className="ts-view">
                <View run={onScreen && !reduced} still={reduced} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
