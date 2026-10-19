import { motion } from 'motion/react';
import { ArrowRight, Pointer } from 'lucide-react';
import { SitePage, usePageTitle } from '@/components/site';
import { APP_HREF } from '@/lib/router';

// inspired by "Nosy 404" on dribbble: a lost page walks on, and the ground is a slowly turning wheel of 404s.
// motion's reduced-motion setting (App.tsx) keeps it all still for people who ask for less movement

const INK = 'var(--color-ink)';
// sized so the visible arc starts and ends on the bottom edge, where the footer begins
const RING = { cx: 300, cy: 760, r: 310 };
const STEP = { duration: 0.5, repeat: Infinity, repeatType: 'reverse' as const, ease: 'easeInOut' as const };

// one leg, drawn hanging from the hip at 0,0. the invisible line keeps its box centred on the hip, so it swings from there.
// both hips are almost the same point, so from the side it reads as a stride
function Leg({ x, delay }: { x: number; delay: number }) {
  return (
    <g transform={`translate(${x} -62)`}>
      <motion.g style={{ originX: '50%', originY: '0%' }} animate={{ rotate: [26, -26] }} transition={{ ...STEP, delay }}>
        <line x1={-26} y1={0} x2={26} y2={0} stroke="none" />
        <line x1={0} y1={0} x2={0} y2={54} stroke={INK} strokeWidth={8} strokeLinecap="round" />
        <path d="M-6 52c0-6 9-8 15-6l11 3c6 2 5 9-1 9H-4c-3 0-4-3-2-6z" fill={INK} />
      </motion.g>
    </g>
  );
}

// the lost page: a pdf with a folded corner, a worried face and two legs
function Walker() {
  return (
    <g transform="translate(300 384)">
      <motion.ellipse cx={4} cy={4} rx={50} ry={6} fill={INK} opacity={0.12} animate={{ scaleX: [1, 0.86] }} transition={{ ...STEP, duration: 0.25 }} />
      <Leg x={-4} delay={0} />
      <Leg x={6} delay={-0.5} />
      <motion.g animate={{ y: [0, -5] }} transition={{ ...STEP, duration: 0.25 }}>
        {/* speed lines behind it */}
        <motion.g stroke={INK} strokeWidth={3.5} strokeLinecap="round" animate={{ opacity: [0.15, 0.55], x: [0, -6] }} transition={{ ...STEP, duration: 0.35 }}>
          <path d="M-92 -196h-34M-100 -172h-46M-90 -148h-28" />
        </motion.g>
        <path d="M-65 -232H33l32 32V-62H-65z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        <path d="M33 -232v32h32" fill="none" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        <g stroke={INK} strokeOpacity={0.22} strokeWidth={5} strokeLinecap="round">
          <path d="M-46 -206h52M-46 -188h62M-46 -170h24M-46 -152h30" />
        </g>
        {/* a worried face, looking where it's going */}
        <g fill={INK}>
          <circle cx={18} cy={-166} r={5.5} />
          <circle cx={42} cy={-163} r={5.5} />
        </g>
        <path d="M12 -182q7-6 13-1M36 -179q7-4 12 1" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <circle cx={33} cy={-140} r={5} fill="none" stroke={INK} strokeWidth={3} />
        <rect x={-80} y={-120} width={62} height={28} rx={7} fill="#fff" stroke="#f5402c" strokeWidth={3} />
        <text x={-49} y={-100} textAnchor="middle" fontSize={17} fontWeight={700} fill="#f5402c" letterSpacing={0.5}>
          PDF
        </text>
      </motion.g>
    </g>
  );
}

// the ground: 404s set round a big circle, turning so the page seems to walk forward
function Ring() {
  const { cx, cy, r } = RING;
  const circumference = 2 * Math.PI * r;
  return (
    <motion.g style={{ originX: '50%', originY: '50%' }} animate={{ rotate: -360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}>
      <path id="nf-ring" d={`M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0`} fill="none" />
      <text
        fontSize={92}
        fontWeight={700}
        fill="none"
        stroke={INK}
        strokeWidth={5}
        strokeLinejoin="round"
      >
        <textPath href="#nf-ring" textLength={circumference} lengthAdjust="spacing">
          {'404 '.repeat(9)}
        </textPath>
      </text>
    </motion.g>
  );
}

// a pointing hand, either side of the main button like the old printer's fist
function Fist({ flip }: { flip?: boolean }) {
  return <Pointer aria-hidden="true" size={30} strokeWidth={1.5} className={flip ? '-rotate-90 text-ink' : 'rotate-90 text-ink'} />;
}

export default function NotFound() {
  usePageTitle('Page not found · snappdf');

  return (
    <SitePage>
      {/* no padding at the bottom, and clipped only there: the wheel of 404s comes out of the footer and goes back into it */}
      <section className="relative mx-auto max-w-6xl px-4 [clip-path:inset(-100vh_-100vw_0_-100vw)] sm:px-6 lg:min-h-[660px]">
        <div className="relative z-10 pt-12 sm:pt-20 lg:max-w-[50%] lg:pt-28">
          <h1 className="text-[44px] font-semibold leading-[1] tracking-[-0.045em] sm:text-[60px] lg:text-[58px]">Oops! Nothing to see here. This page went for a walk.</h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink/60">
            We looked everywhere for <span className="break-all font-mono text-[14px] text-ink/80">{location.pathname}</span>. Use the button below
            to get back to a real page.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Fist />
            <a href="/" className="inline-flex h-12 items-center rounded-xl bg-ink px-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-canvas transition-colors hover:bg-ink/85">
              Front page
            </a>
            <Fist flip />
          </div>
          <a href={APP_HREF} className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink/60 transition-colors hover:text-ink">
            or open the tools
            <ArrowRight size={16} />
          </a>
        </div>

        <div aria-hidden="true" className="relative -mx-4 mt-6 h-[300px] sm:mx-0 sm:h-[440px] lg:absolute lg:bottom-0 lg:right-10 lg:mt-0 lg:h-full lg:w-[56%] xl:right-0">
          <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMax meet" className="absolute inset-0 size-full overflow-visible">
            <Ring />
            <Walker />
          </svg>
        </div>
      </section>
    </SitePage>
  );
}
