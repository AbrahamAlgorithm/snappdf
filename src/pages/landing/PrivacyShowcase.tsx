import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { Ban, CloudOff, Laptop, LoaderCircle, ScanSearch, ShieldCheck } from 'lucide-react';
import { GITHUB_URL } from '@/lib/site';
import { cn } from '@/lib/utils';
import { SplitText, useInView, useTicker } from '@/pages/landing/motion';

// privacy demo: signing a contract while the network panel shows nothing going out

const GREEN = '#1d8348';

const STEPS = [
  { at: 1, time: '14:02:31', text: 'Opened contract.pdf from your device', doing: 'Opening contract.pdf', meta: '1.2 MB' },
  { at: 3, time: '14:02:32', text: 'Rendered 4 pages in this tab', doing: 'Rendering pages', meta: '0.4 s' },
  { at: 5, time: '14:02:39', text: 'Placed your signature on page 4', doing: 'Placing your signature', meta: 'Signature 1' },
  { at: 7, time: '14:02:41', text: 'Saved contract-signed.pdf to Downloads', doing: 'Saving the signed copy', meta: '1.3 MB' },
];
const LOOP = 14;

const FACTS = [
  { icon: Laptop, title: 'Runs in your browser', body: 'Your files are opened, edited and saved by code running on your own device.' },
  { icon: CloudOff, title: 'No upload step', body: 'There’s no server that receives your files, so there’s nothing to store or delete later.' },
  {
    icon: ScanSearch,
    title: 'Check it yourself',
    body: (
      <>
        Watch your browser’s network panel while you work, or{' '}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
          read the code on GitHub
        </a>
        .
      </>
    ),
  },
];

const WIN_W = 680;
const WIN_W_NARROW = 480;

export function PrivacyShowcase() {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const onScreen = useInView(ref, { once: false, rootMargin: '0px' });
  const reduced = !!useReducedMotion();
  const tick = useTicker(inView && onScreen && !reduced, 700);
  const t = reduced ? LOOP - 1 : tick % LOOP;
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const small = el.clientWidth < 600;
      const ww = small ? WIN_W_NARROW : WIN_W;
      const left = small ? 18 : 36;
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

  const shown = STEPS.filter((s) => t >= s.at);
  const next = STEPS.find((s) => t < s.at);
  const done = !next;
  const processed = t >= 7 ? '2.5 MB' : t >= 1 ? '1.2 MB' : '0 B';

  return (
    <section id="privacy" ref={ref} className={cn('pv scroll-mt-16', inView && 'is-in')} aria-labelledby="privacy-title">
      <div className="pv-grid mx-auto max-w-6xl px-4 sm:px-6">
        <div
          ref={stageRef}
          className={cn('lp-stage pv-stage ent ent-scale', narrow && 'is-narrow')}
          style={{ '--d': '200ms' } as CSSProperties}
          aria-hidden="true"
        >
          <span className="lp-glow is-on" style={{ '--c': GREEN } as CSSProperties} />
          <div className="lp-win pv-win" style={{ '--c': GREEN } as CSSProperties}>
            <div className="lp-chrome">
              <span className="lp-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="lp-crumb">
                Workspace
                <em>/</em>
                <b>Sign documents</b>
                <em className="lp-mid">/</em>
                <span className="lp-mid">contract.pdf</span>
              </span>
              <span className="lp-as">
                <ShieldCheck />
                On this device
              </span>
            </div>

            <div className="pv-app">
              <div className="lp-head">
                <div className="min-w-0">
                  <p className="lp-h">
                    contract.pdf
                    <span key={done ? 'done' : 'work'} className="lp-pill lp-swap" data-tone={done ? 'ok' : 'review'}>
                      {done ? 'Signed' : 'Working'}
                    </span>
                  </p>
                  <p className="lp-sub">Activity in this tab</p>
                </div>
                <span className="pv-stats">
                  <span className="pv-stat">
                    <em>Processed here</em>
                    <b key={processed} className="lp-swap">
                      {processed}
                    </b>
                  </span>
                  <span className="pv-stat is-zero">
                    <em>Uploaded</em>
                    <b>0 B</b>
                  </span>
                </span>
              </div>
              <div className="pv-log">
                {shown.map((s) => (
                  <div key={s.at} className="pv-row">
                    <time>{s.time}</time>
                    <span>{s.text}</span>
                    <em>{s.meta}</em>
                    <span className="lp-pill" data-tone="ok">
                      On device
                    </span>
                  </div>
                ))}
                {next && (
                  <div key={`wait-${next.at}`} className="pv-row is-wait">
                    <LoaderCircle className="pv-spin" />
                    <span>{next.doing}…</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pv-dev">
              <div className="pv-tabs">
                <span>Elements</span>
                <span>Console</span>
                <span>Sources</span>
                <span className="is-on">Network</span>
                <span>Performance</span>
              </div>
              <div className="pv-bar">
                <i className="pv-rec" />
                <Ban />
                <span className="pv-filter">Filter</span>
                <span className="pv-types">
                  <span>All</span>
                  <span className="is-on">Fetch/XHR</span>
                  <span>Doc</span>
                  <span>JS</span>
                  <span>Img</span>
                  <span>Media</span>
                </span>
              </div>
              <div className="pv-th">
                <span>Name</span>
                <span>Status</span>
                <span>Type</span>
                <span>Size</span>
              </div>
              <div className="pv-empty">
                <b>Recording network activity…</b>
                <em>No requests while you work. Your file hasn’t been sent anywhere.</em>
              </div>
              <div className="pv-status">
                0 requests
                <s />
                <b>0 B transferred</b>
                <s />
                Recording
              </div>
            </div>
          </div>
        </div>

        <div className="pv-copy">
          <p className="ent text-[14px] font-medium text-ink/50">Privacy</p>
          <h2 id="privacy-title" className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-[-0.045em] text-balance sm:text-[52px]">
            <SplitText lines={[{ parts: [{ text: 'Your files never leave' }, { text: 'your device', className: 'g' }] }]} delay={60} />
          </h2>
          <p className="ent mt-5 max-w-md text-[17px] leading-relaxed text-ink/60" style={{ '--d': '180ms' } as CSSProperties}>
            Every tool runs inside this browser tab. There’s no upload step, so there’s nothing to store, leak or sell.
          </p>
          <ul className="pv-facts">
            {FACTS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="pv-fact ent" style={{ '--d': `${260 + i * 110}ms` } as CSSProperties}>
                <span className="pv-ico">
                  <Icon aria-hidden="true" />
                </span>
                <span>
                  <b>{title}</b>
                  <p>{body}</p>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
