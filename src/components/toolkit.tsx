import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DropzoneState } from 'react-dropzone';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, Plus, ShieldCheck, Upload, X } from 'lucide-react';
import { APP_HREF } from '@/lib/router';
import type { Tool } from '@/lib/site';
import { cn } from '@/lib/utils';

// shared ui for the tool pages

// basics
const BUTTON_VARIANTS = {
  primary: 'bg-ink text-canvas hover:bg-ink/85',
  tonal: 'bg-subtle text-ink hover:bg-line',
  outline: 'border border-line bg-canvas text-ink hover:bg-subtle',
  ghost: 'text-ink/70 hover:bg-subtle hover:text-ink',
  danger: 'text-red-600 hover:bg-red-50',
};

const BUTTON_SIZES = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-5 text-[14px]',
  lg: 'h-12 px-6 text-[15px]',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function Button({ variant = 'tonal', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  label,
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full text-ink/70 transition-colors hover:bg-subtle hover:text-ink disabled:pointer-events-none disabled:opacity-30',
        size === 'xs' ? 'size-7' : size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={cn('size-5 animate-spin', className)} />;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-ink' : 'bg-line')}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 size-5 rounded-full bg-canvas shadow-sm transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ToolIcon({ tool, size = 'md', className }: { tool: Tool; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = tool.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'sm' ? 'size-8 rounded-[10px]' : size === 'lg' ? 'size-16 rounded-[20px]' : 'size-11 rounded-[14px]',
        className,
      )}
      style={{ backgroundColor: `color-mix(in srgb, ${tool.color} 13%, white)`, color: tool.color }}
    >
      <Icon className={size === 'sm' ? 'size-[18px]' : size === 'lg' ? 'size-8' : 'size-[22px]'} strokeWidth={1.8} />
    </span>
  );
}

export function PrivacyChip({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full bg-subtle px-3 py-1.5 text-[12.5px] text-ink/65', className)}>
      <span className="size-1.5 rounded-full bg-lime ring-2 ring-lime/30" />
      Files stay on this device
    </span>
  );
}

export function PrivacyNote() {
  return (
    <p className="mt-5 flex items-center justify-center gap-2 text-center text-[13px] text-ink/50">
      <ShieldCheck size={15} aria-hidden="true" className="shrink-0" />
      Your files are processed on this device and never uploaded.
    </p>
  );
}

// layout
export function ToolShell({ tool, children }: { tool: Tool; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-subtle text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas">
        <div className="flex h-16 items-center gap-1 px-2 sm:px-4">
          <a
            href={APP_HREF}
            aria-label="All tools"
            title="All tools"
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink/70 transition-colors hover:bg-subtle hover:text-ink"
          >
            <ArrowLeft size={20} />
          </a>
          <ToolIcon tool={tool} size="sm" className="ml-1" />
          <h1 className="ml-2.5 truncate text-[17px] font-semibold tracking-[-0.02em]">{tool.name}</h1>
          <PrivacyChip className="ml-auto hidden sm:inline-flex" />
        </div>
      </header>
      {children}
    </div>
  );
}

// content left, settings right, on phones leave room for the sticky action at the bottom
export function Workbench({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
  return (
    <div className={cn('mx-auto flex max-w-[1400px] flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:items-start lg:gap-5 lg:p-6', panel && 'pb-28 lg:pb-6')}>
      <div className="min-w-0 flex-1">{children}</div>
      {panel}
    </div>
  );
}

export function Panel({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside className="w-full shrink-0 rounded-[24px] bg-card p-5 lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-112px)] lg:w-[320px] lg:overflow-y-auto">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 p-3 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {footer}
        </div>
      )}
    </aside>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink/55">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function FileRow({ name, meta, onChange, className }: { name: string; meta: string; onChange?: () => void; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-[20px] bg-card p-3 sm:p-4', className)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-subtle text-ink/60">
        <FileText size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{name}</p>
        <p className="text-[13px] text-ink/55">{meta}</p>
      </div>
      {onChange && (
        <Button variant="ghost" size="sm" onClick={onChange}>
          Change file
        </Button>
      )}
    </div>
  );
}

export function UploadCard({
  tool,
  dropzone,
  title,
  hint,
  button,
  formats,
  busy,
}: {
  tool: Tool;
  dropzone: Pick<DropzoneState, 'getRootProps' | 'getInputProps' | 'isDragActive' | 'open'>;
  title: string;
  hint: string;
  button: string;
  formats: string;
  busy?: string | null;
}) {
  const { getRootProps, getInputProps, isDragActive, open } = dropzone;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <div
        {...getRootProps({
          className: cn(
            'flex cursor-pointer flex-col items-center rounded-[28px] border-2 border-dashed bg-card px-6 py-12 text-center transition-colors sm:py-16',
            isDragActive ? 'border-ink bg-canvas' : 'border-line hover:border-ink/25',
          ),
        })}
      >
        <input {...getInputProps()} />
        {busy ? (
          <div className="flex flex-col items-center py-10" role="status">
            <Spinner className="size-8 text-ink/70" />
            <p className="mt-5 text-[16px] font-medium">{busy}</p>
          </div>
        ) : (
          <>
            <ToolIcon tool={tool} size="lg" />
            <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.03em] sm:text-[26px]">{isDragActive ? 'Drop to add' : title}</h2>
            <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink/60">{hint}</p>
            <Button
              variant="primary"
              size="lg"
              className="mt-7"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
            >
              <Upload size={18} />
              {button}
            </Button>
            <p className="mt-5 text-[13px] text-ink/45">{formats}</p>
          </>
        )}
      </div>
      <PrivacyNote />
    </div>
  );
}

// overlays
function useEscape(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && handler.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

export function Dialog({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  useEscape(open, onClose);
  // only close if the press starts and ends on the backdrop, so a stray drag doesn't close it
  const pressedScrim = useRef(false);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onPointerDown={(e) => (pressedScrim.current = e.target === e.currentTarget)}
          onClick={(e) => pressedScrim.current && e.target === e.currentTarget && onClose()}
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/40 p-4"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn('w-full max-w-md rounded-[28px] bg-card p-6 text-ink shadow-2xl', className)}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ask for a file name before downloading, `suggested` comes without the extension
export function NameDialog({
  suggested,
  onCancel,
  onConfirm,
}: {
  suggested: string | null;
  onCancel: () => void;
  onConfirm: (fileName: string) => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (suggested === null) return;
    setValue(suggested);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [suggested]);

  const submit = () => {
    const base = value.trim() || suggested || 'document';
    onConfirm(base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`);
  };

  return (
    <Dialog open={suggested !== null} onClose={onCancel} labelledBy="name-dialog-title">
      <h2 id="name-dialog-title" className="text-[20px] font-semibold tracking-[-0.02em]">
        Name your PDF
      </h2>
      <p className="mt-1.5 text-[14px] text-ink/60">It will be saved to your downloads.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-5"
      >
        <label className="flex h-12 items-center gap-1 rounded-[14px] border border-line bg-canvas px-4 transition-colors focus-within:border-ink">
          <span className="sr-only">File name</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={suggested ?? ''}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
          <span className="text-[15px] text-ink/40">.pdf</span>
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            <Download size={16} />
            Download
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// full screen page preview, arrow keys flip pages
export function PageViewer({
  previews,
  count,
  index,
  onIndex,
  onClose,
  selected,
  onToggle,
  renderPage,
}: {
  previews: string[];
  count: number;
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
  selected?: boolean;
  onToggle?: () => void;
  renderPage?: (index: number, width: number, height: number) => Promise<string>;
}) {
  const open = index !== null;
  useEscape(open, onClose);

  // show the small thumbnail right away, then swap in a sharp render that fits the screen
  const stageRef = useRef<HTMLDivElement>(null);
  const [sharp, setSharp] = useState<{ index: number; url: string } | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (index === null) return setSharp(null);
    if (!renderPage || !stage) return;
    const pad = getComputedStyle(stage);
    const width = stage.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const height = stage.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
    let cancelled = false;
    renderPage(index, width, height)
      .then((url) => (cancelled ? URL.revokeObjectURL(url) : setSharp({ index, url })))
      .catch((err) => !cancelled && console.error('Page render error', err));
    return () => {
      cancelled = true;
    };
  }, [index, renderPage]);

  // free the old render once it's replaced or the preview closes
  useEffect(() => {
    if (!sharp) return;
    return () => URL.revokeObjectURL(sharp.url);
  }, [sharp]);

  const src = sharp?.index === index ? sharp.url : index !== null ? previews[index] : undefined;

  // a click anywhere but the page or a button closes the preview, including the empty space around the page
  const pressedOutside = useRef(false);
  const isOutside = (e: { target: EventTarget; clientX: number; clientY: number }) => {
    const el = e.target as Element;
    if (el.closest('button')) return false;
    if (!(el instanceof HTMLImageElement)) return !el.closest('[data-page]');
    const box = el.getBoundingClientRect();
    const scale = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight);
    const padX = (box.width - el.naturalWidth * scale) / 2;
    const padY = (box.height - el.naturalHeight * scale) / 2;
    return e.clientX < box.left + padX || e.clientX > box.right - padX || e.clientY < box.top + padY || e.clientY > box.bottom - padY;
  };

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index < count - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndex]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Page ${index + 1} of ${count}`}
          onPointerDown={(e) => (pressedOutside.current = isOutside(e))}
          onClick={(e) => pressedOutside.current && isOutside(e) && onClose()}
          className="fixed inset-0 z-[100] flex flex-col bg-[#18181b] text-white"
        >
          <div className="flex h-16 shrink-0 items-center gap-3 px-3 sm:px-5">
            <IconButton label="Close" onClick={onClose} className="text-white/80 hover:bg-white/10 hover:text-white">
              <X size={20} />
            </IconButton>
            <span className="text-[15px] font-medium tabular-nums">
              Page {index + 1} of {count}
            </span>
            {onToggle && (
              <Button
                variant={selected ? 'primary' : 'outline'}
                onClick={onToggle}
                className={cn('ml-auto', selected ? 'bg-white text-black hover:bg-white/85' : 'border-white/25 bg-transparent text-white hover:bg-white/10')}
              >
                {selected ? <Check size={16} /> : <Plus size={16} />}
                {selected ? 'Selected' : 'Select page'}
              </Button>
            )}
          </div>
          <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6 sm:px-20">
            <IconButton
              label="Previous page"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
              className="absolute left-2 bg-white/10 text-white hover:bg-white/20 hover:text-white disabled:pointer-events-auto sm:left-5"
            >
              <ChevronLeft size={22} />
            </IconButton>
            {src ? (
              <img
                key={index}
                data-page
                src={src}
                alt={`Page ${index + 1}`}
                className="size-full object-contain drop-shadow-2xl"
              />
            ) : (
              <div data-page className="flex aspect-[3/4] h-full max-h-[70vh] items-center justify-center rounded-sm bg-white/5">
                <Spinner className="size-8 text-white/60" />
              </div>
            )}
            <IconButton
              label="Next page"
              disabled={index === count - 1}
              onClick={() => onIndex(index + 1)}
              className="absolute right-2 bg-white/10 text-white hover:bg-white/20 hover:text-white disabled:pointer-events-auto sm:right-5"
            >
              <ChevronRight size={22} />
            </IconButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
