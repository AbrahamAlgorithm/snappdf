import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Maximize, ScanLine, X } from 'lucide-react';
import { Button, IconButton, Spinner } from '@/components/toolkit';
import { isConvex, type Point, type Quad } from '@/lib/scan';
import { cn } from '@/lib/utils';

const CORNER_NAMES = ['Top left corner', 'Top right corner', 'Bottom right corner', 'Bottom left corner'];
const EDGE_NAMES = ['Top edge', 'Right edge', 'Bottom edge', 'Left edge'];
const LOUPE = 112; // magnifier size in px
const ZOOM = 2.5;

const wholePhoto = (w: number, h: number): Quad => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

const isWhole = (q: Quad, w: number, h: number) => wholePhoto(w, h).every((p, i) => Math.abs(p.x - q[i].x) < 1 && Math.abs(p.y - q[i].y) < 1);

type Drag = { kind: 'corner' | 'edge'; index: number; start: Point; from: Quad };

/**
 * Drag the four corners (or the edges) onto the page, like a scanner app. The photo itself is never
 * changed here, it hands back the corners and the caller flattens the page.
 */
export function CornerEditor({
  src,
  corners,
  onDetect,
  onCancel,
  onApply,
}: {
  src: string | null; // the original photo, null when closed
  corners: Quad | null; // where the page was last time, null for the whole photo
  onDetect: () => Promise<Quad | null>;
  onCancel: () => void;
  onApply: (corners: Quad | null) => void | Promise<void>;
}) {
  const open = src !== null;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; scale: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [finding, setFinding] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [applying, setApplying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // start fresh each time a photo opens
  useEffect(() => {
    setSize(null);
    setQuad(null);
    setNotFound(false);
    setApplying(false);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  // fit the photo in the space left between the bars
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !size) return;
    const fit = () => {
      const pad = 24;
      const w = stage.clientWidth - pad * 2;
      const h = stage.clientHeight - pad * 2;
      const scale = Math.min(w / size.width, h / size.height);
      setBox({ scale, left: pad + (w - size.width * scale) / 2, top: pad + (h - size.height * scale) / 2 });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [size, open]);

  const toPhoto = (e: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(((e.clientX - rect.left) / rect.width) * size!.width, 0), size!.width),
      y: Math.min(Math.max(((e.clientY - rect.top) / rect.height) * size!.height, 0), size!.height),
    };
  };

  // corners stay on the photo and the outline never folds over itself
  const move = (next: Quad) => {
    if (!size) return;
    const clamped = next.map((p) => ({ x: Math.min(Math.max(p.x, 0), size.width), y: Math.min(Math.max(p.y, 0), size.height) })) as Quad;
    if (isConvex(clamped)) setQuad(clamped);
  };

  const moved = (d: Drag, to: Point): Quad => {
    const next = d.from.map((p) => ({ ...p })) as Quad;
    if (d.kind === 'corner') {
      next[d.index] = to;
      return next;
    }
    // an edge slides straight in or out, both its corners together
    const a = d.from[d.index];
    const b = d.from[(d.index + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const push = (to.x - d.start.x) * nx + (to.y - d.start.y) * ny;
    next[d.index] = { x: a.x + nx * push, y: a.y + ny * push };
    next[(d.index + 1) % 4] = { x: b.x + nx * push, y: b.y + ny * push };
    return next;
  };

  const startDrag = (e: PointerEvent, kind: Drag['kind'], index: number) => {
    if (!quad) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ kind, index, start: toPhoto(e), from: quad });
  };

  const onPointerMove = (e: PointerEvent) => drag && move(moved(drag, toPhoto(e)));

  // arrow keys nudge the focused corner or edge
  const nudge = (e: KeyboardEvent, kind: Drag['kind'], index: number) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step || !quad || !box) return;
    e.preventDefault();
    const by = (e.shiftKey ? 10 : 2) / box.scale;
    const d: Drag = { kind, index, start: { x: 0, y: 0 }, from: quad };
    move(moved(d, { x: step[0] * by, y: step[1] * by }));
  };

  const findPage = async () => {
    setFinding(true);
    setNotFound(false);
    try {
      const found = await onDetect();
      if (found) setQuad(found);
      else setNotFound(true);
    } finally {
      setFinding(false);
    }
  };

  const loupeAt = drag && quad ? (drag.kind === 'corner' ? quad[drag.index] : null) : null;

  return (
    <AnimatePresence>
      {src !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label="Crop to the page"
          className="fixed inset-0 z-[100] flex flex-col bg-[#18181b] text-white"
        >
          <div className="flex h-16 shrink-0 items-center gap-2 px-3 sm:px-5">
            <IconButton label="Cancel" onClick={onCancel} className="text-white/80 hover:bg-white/10 hover:text-white">
              <X size={20} />
            </IconButton>
            <span className="hidden text-[15px] font-medium sm:inline">Drag the corners onto the page</span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={findPage} disabled={!size || finding} className="border-white/25 bg-transparent text-white hover:bg-white/10">
                {finding ? <Spinner className="size-4" /> : <ScanLine size={16} />}
                Find page
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => size && setQuad(wholePhoto(size.width, size.height))}
                disabled={!size}
                className="border-white/25 bg-transparent text-white hover:bg-white/10"
              >
                <Maximize size={16} />
                Whole photo
              </Button>
            </div>
          </div>

          <div ref={stageRef} className="relative min-h-0 flex-1 select-none">
            {/* hidden until it's measured, so the outline never jumps */}
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
                setSize({ width, height });
                setQuad(corners ?? wholePhoto(width, height));
              }}
              className="absolute opacity-0"
              style={box && size ? { left: box.left, top: box.top, width: size.width * box.scale, height: size.height * box.scale, opacity: 1 } : undefined}
            />
            {!quad && (
              <div className="absolute inset-0 grid place-items-center">
                <Spinner className="size-8 text-white/60" />
              </div>
            )}
            {box && size && quad && (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${size.width} ${size.height}`}
                onPointerMove={onPointerMove}
                onPointerUp={() => setDrag(null)}
                onPointerCancel={() => setDrag(null)}
                className="absolute touch-none overflow-visible"
                style={{ left: box.left, top: box.top, width: size.width * box.scale, height: size.height * box.scale }}
              >
                {/* dim everything that's not the page */}
                <path
                  d={`M0 0H${size.width}V${size.height}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join('L')}Z`}
                  fill="rgba(0,0,0,0.55)"
                  fillRule="evenodd"
                />
                <polygon
                  points={quad.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(82,255,0,0.06)"
                  stroke="#52ff00"
                  strokeWidth={2 / box.scale}
                  strokeLinejoin="round"
                />
                {quad.map((p, i) => {
                  const q = quad[(i + 1) % 4];
                  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
                  const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
                  return (
                    <g
                      key={`edge${i}`}
                      role="slider"
                      aria-label={EDGE_NAMES[i]}
                      aria-valuetext={`${Math.round(mid.x)}, ${Math.round(mid.y)}`}
                      tabIndex={0}
                      onPointerDown={(e) => startDrag(e, 'edge', i)}
                      onKeyDown={(e) => nudge(e, 'edge', i)}
                      className="cursor-grab outline-none active:cursor-grabbing [&:focus-visible>rect]:stroke-white"
                      transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`}
                    >
                      <rect x={-22 / box.scale} y={-18 / box.scale} width={44 / box.scale} height={36 / box.scale} fill="transparent" />
                      <rect
                        x={-14 / box.scale}
                        y={-4 / box.scale}
                        width={28 / box.scale}
                        height={8 / box.scale}
                        rx={4 / box.scale}
                        fill="#fff"
                        stroke="#52ff00"
                        strokeWidth={2 / box.scale}
                      />
                    </g>
                  );
                })}
                {quad.map((p, i) => (
                  <g
                    key={`corner${i}`}
                    role="slider"
                    aria-label={CORNER_NAMES[i]}
                    aria-valuetext={`${Math.round(p.x)}, ${Math.round(p.y)}`}
                    tabIndex={0}
                    onPointerDown={(e) => startDrag(e, 'corner', i)}
                    onKeyDown={(e) => nudge(e, 'corner', i)}
                    className="cursor-grab outline-none active:cursor-grabbing [&:focus-visible>circle:last-child]:fill-[#52ff00]"
                  >
                    <circle cx={p.x} cy={p.y} r={26 / box.scale} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={10 / box.scale} fill="#fff" stroke="#52ff00" strokeWidth={3 / box.scale} />
                  </g>
                ))}
              </svg>
            )}

            {/* a magnifier, so the corner under your finger can still be placed exactly */}
            {loupeAt && box && size && src && (
              <div
                aria-hidden="true"
                className={cn('pointer-events-none absolute top-4 overflow-hidden rounded-full border-2 border-white shadow-2xl', loupeAt.x < size.width / 2 ? 'right-4' : 'left-4')}
                style={{
                  width: LOUPE,
                  height: LOUPE,
                  backgroundImage: `url("${src}")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: `${size.width * box.scale * ZOOM}px ${size.height * box.scale * ZOOM}px`,
                  backgroundPosition: `${LOUPE / 2 - loupeAt.x * box.scale * ZOOM}px ${LOUPE / 2 - loupeAt.y * box.scale * ZOOM}px`,
                  backgroundColor: '#000',
                }}
              >
                <span className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#52ff00]" />
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-5">
            <p role="status" className="min-w-0 flex-1 text-[13px] text-white/60">
              {notFound ? 'Couldn’t spot the page here, drag the corners onto it.' : null}
            </p>
            <Button variant="ghost" onClick={onCancel} className="text-white/80 hover:bg-white/10 hover:text-white">
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!quad || !size || applying}
              onClick={async () => {
                if (!quad || !size) return;
                setApplying(true);
                await onApply(isWhole(quad, size.width, size.height) ? null : quad);
              }}
              className="bg-white text-black hover:bg-white/85"
            >
              {applying ? <Spinner className="size-[18px]" /> : <Check size={18} />}
              Apply
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
