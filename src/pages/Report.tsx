import { useRef, useState, type FormEvent } from 'react';
import { Bug, CircleCheck, CircleHelp, Lightbulb, Send } from 'lucide-react';
import { SitePage, usePageTitle } from '@/components/site';
import { Button, Select, Spinner, ToolIcon, type SelectOption } from '@/components/toolkit';
import { GITHUB_URL, TOOLS } from '@/lib/site';
import { cn } from '@/lib/utils';

type Kind = 'bug' | 'feature';

const KINDS: { id: Kind; label: string; icon: typeof Bug }[] = [
  { id: 'bug', label: 'A bug', icon: Bug },
  { id: 'feature', label: 'An idea', icon: Lightbulb },
];

const otherIcon = (
  <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-subtle text-ink/55">
    <CircleHelp size={18} />
  </span>
);

const TOOL_OPTIONS: SelectOption[] = [
  ...TOOLS.map((tool) => ({ value: tool.name, label: tool.name, icon: <ToolIcon tool={tool} size="sm" /> })),
  { value: 'The website', label: 'The website', icon: otherIcon },
  { value: 'Something else', label: 'Something else', icon: otherIcon },
];

const field =
  'w-full rounded-[14px] border border-line bg-canvas px-4 text-[15px] outline-none transition-colors placeholder:text-ink/35 hover:border-ink/30 focus:border-ink';

// links like /report?type=feature&tool=merge-pdf start the form filled in
function startingValues() {
  const params = new URLSearchParams(location.search);
  const tool = TOOLS.find((t) => t.id === params.get('tool'));
  return { kind: (params.get('type') === 'feature' ? 'feature' : 'bug') as Kind, tool: tool?.name ?? '' };
}

type Status = { state: 'idle' } | { state: 'sending' } | { state: 'sent' } | { state: 'failed'; message: string };

export default function Report() {
  usePageTitle('Report a bug or request a feature · snappdf');
  const [start] = useState(startingValues);
  const [kind, setKind] = useState<Kind>(start.kind);
  const [tool, setTool] = useState(start.tool);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [steps, setSteps] = useState('');
  const [email, setEmail] = useState('');
  const [trap, setTrap] = useState('');
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  // when the form appeared, the server ignores reports sent faster than a person could type one
  const openedAt = useRef(Date.now());

  const isBug = kind === 'bug';
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const missing = { title: !title.trim(), details: !details.trim(), email: !emailOk };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (missing.title || missing.details || missing.email) return;
    setStatus({ state: 'sending' });
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          tool,
          title,
          details,
          steps: isBug ? steps : '',
          email,
          website: trap,
          elapsed: Date.now() - openedAt.current,
        }),
      });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(answer.error || 'We couldn’t send that right now.');
      setStatus({ state: 'sent' });
    } catch (err) {
      const offline = !navigator.onLine;
      setStatus({
        state: 'failed',
        message: offline ? 'You’re offline right now. Connect to the internet and try again.' : (err as Error).message || 'We couldn’t send that right now.',
      });
    }
  };

  const startAgain = () => {
    setTitle('');
    setDetails('');
    setSteps('');
    setTried(false);
    setStatus({ state: 'idle' });
    openedAt.current = Date.now();
  };

  const error = (show: boolean, id: string, message: string) =>
    show && (
      <p id={id} className="mt-2 text-[13px] text-red-600">
        {message}
      </p>
    );

  return (
    <SitePage>
      <div className="mx-auto max-w-5xl px-4 pb-32 pt-12 sm:px-6 sm:pt-20">
        <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[56px]">Report a bug or request a feature</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink/60 sm:mt-5 sm:text-[18px]">
          Found something broken, or wish snappdf could do something? Tell us here, it goes straight to the person who builds it.
        </p>

        {status.state === 'sent' ? (
          <div role="status" className="mt-12 rounded-[28px] bg-subtle p-7 sm:p-10">
            <CircleCheck size={32} className="text-[#1d8348]" />
            <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.03em]">Thanks, it’s on its way</h2>
            <p className="mt-2 max-w-xl text-[16px] leading-relaxed text-ink/65">
              Every report gets read. {email.trim() ? 'We’ll reply to your email if we need more details.' : 'Since you didn’t leave an email, we can’t reply, but it still helps.'}
            </p>
            <Button variant="primary" size="lg" className="mt-7" onClick={startAgain}>
              Send another
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-9 space-y-8 sm:mt-12">
            <fieldset>
              <legend className="text-[15px] font-medium">What’s it about?</legend>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {KINDS.map(({ id, label, icon: Icon }) => (
                  <label
                    key={id}
                    className={cn(
                      'flex cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border px-3 py-3 text-[15px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink sm:justify-start sm:rounded-[16px] sm:px-4 sm:py-3.5',
                      kind === id ? 'border-ink bg-ink text-canvas' : 'border-line bg-canvas hover:border-ink/30',
                    )}
                  >
                    <input type="radio" name="kind" value={id} checked={kind === id} onChange={() => setKind(id)} className="sr-only" />
                    <Icon size={18} className="shrink-0" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-8 sm:grid-cols-2 sm:gap-5">
              <div>
                <p id="report-tool-label" className="text-[15px] font-medium">
                  Which part of snappdf?
                </p>
                <Select id="report-tool" labelId="report-tool-label" value={tool} options={TOOL_OPTIONS} onChange={setTool} placeholder="Not sure" className="mt-3" />
              </div>
              <div>
                <label htmlFor="report-email" className="text-[15px] font-medium">
                  Your email <span className="font-normal text-ink/45">(optional, for a reply)</span>
                </label>
                <input
                  id="report-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  maxLength={200}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={tried && missing.email}
                  aria-describedby={tried && missing.email ? 'report-email-error' : undefined}
                  className={cn(field, 'mt-3 h-12', tried && missing.email && 'border-red-500')}
                />
                {error(tried && missing.email, 'report-email-error', 'That email doesn’t look right.')}
              </div>
            </div>

            <div>
              <label htmlFor="report-title" className="text-[15px] font-medium">
                {isBug ? 'Sum it up in a few words' : 'Name your idea'}
              </label>
              <input
                id="report-title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isBug ? 'e.g. Merge gets stuck on big files' : 'e.g. Compress PDFs to send by email'}
                aria-invalid={tried && missing.title}
                aria-describedby={tried && missing.title ? 'report-title-error' : undefined}
                className={cn(field, 'mt-3 h-12', tried && missing.title && 'border-red-500')}
              />
              {error(tried && missing.title, 'report-title-error', 'Add a short title.')}
            </div>

            <div>
              <label htmlFor="report-details" className="text-[15px] font-medium">
                {isBug ? 'What happened?' : 'What would you like snappdf to do?'}
              </label>
              <textarea
                id="report-details"
                value={details}
                maxLength={3000}
                rows={5}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={isBug ? 'What did you do, what went wrong, and what did you expect instead?' : 'Describe it, and how it would help you.'}
                aria-invalid={tried && missing.details}
                aria-describedby={tried && missing.details ? 'report-details-error' : undefined}
                className={cn(field, 'mt-3 resize-y py-3 leading-relaxed', tried && missing.details && 'border-red-500')}
              />
              {error(tried && missing.details, 'report-details-error', isBug ? 'Tell us what happened.' : 'Tell us about your idea.')}
            </div>

            {isBug && (
              <div>
                <label htmlFor="report-steps" className="text-[15px] font-medium">
                  How can we make it happen again? <span className="font-normal text-ink/45">(optional)</span>
                </label>
                <textarea
                  id="report-steps"
                  value={steps}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder={'1. Open Merge PDF\n2. Add two PDFs\n3. …'}
                  className={cn(field, 'mt-3 resize-y py-3 leading-relaxed')}
                />
              </div>
            )}

            {/* left empty by people, bots fill every field they find */}
            <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
              <label htmlFor="report-website">Website</label>
              <input id="report-website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
            </div>

            <div>
              {status.state === 'failed' && (
                <p role="alert" className="mb-4 rounded-[14px] bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-700">
                  {status.message}{' '}
                  <a href={`${GITHUB_URL}/issues/new`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                    You can also report it on GitHub.
                  </a>
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" disabled={status.state === 'sending'} className="w-full sm:w-auto">
                {status.state === 'sending' ? <Spinner className="size-[18px]" /> : <Send size={18} />}
                {status.state === 'sending' ? 'Sending…' : 'Send report'}
              </Button>
              <p className="mt-4 text-[13px] leading-relaxed text-ink/50">
                Your report is emailed privately to the maintainer. Only what you type here is sent, nothing about your files or device.
              </p>
            </div>
          </form>
        )}
      </div>
    </SitePage>
  );
}
