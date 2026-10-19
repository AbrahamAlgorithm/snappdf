import type { ReactNode } from 'react';
import { Ban, ShieldCheck } from 'lucide-react';
import { GitHubMark } from '@/components/brand';
import { SitePage, usePageTitle } from '@/components/site';
import { GITHUB_URL } from '@/lib/site';

const UPDATED = '19 October 2026';

const link = 'font-medium text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-ink';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="text-[22px] font-semibold tracking-[-0.03em]">{title}</h2>
      <div className="mt-3 space-y-4 text-[16px] leading-relaxed text-ink/70">{children}</div>
    </section>
  );
}

const PROMISES = [
  { icon: ShieldCheck, text: 'Your files never leave your device.' },
  { icon: Ban, text: 'No accounts, cookies, ads or analytics.' },
  { icon: GitHubMark, text: 'Open source, so you can check all of this.' },
];

export default function Privacy() {
  usePageTitle('Privacy policy · snappdf');

  return (
    <SitePage>
      <article className="mx-auto max-w-2xl px-4 pb-32 pt-12 sm:px-6 sm:pt-20">
        <p className="text-[14px] text-ink/45">Last updated {UPDATED}</p>
        <h1 className="mt-3 text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[56px]">Privacy policy</h1>
        <p className="mt-5 text-[18px] leading-relaxed text-ink/60">
          snappdf is built so there’s almost nothing to say here. Your documents are yours, and they stay on your device.
        </p>

        <ul className="mt-10 grid gap-3 sm:grid-cols-3">
          {PROMISES.map(({ icon: Icon, text }) => (
            <li key={text} className="rounded-[20px] bg-subtle p-5">
              <Icon className="size-5 text-ink/70" />
              <p className="mt-3 text-[15px] font-medium leading-snug">{text}</p>
            </li>
          ))}
        </ul>

        <div className="mt-14 space-y-10">
          <Section title="Your files stay on your device">
            <p>
              Every tool runs inside your browser. When you add a photo, PDF or document, it’s read and processed on your own device, and the
              result is made there too. Your files are never uploaded to our server or anyone else’s.
            </p>
            <p>
              While you work, your files are kept in your browser tab’s memory so you can switch between tools. Close or refresh the tab and they’re
              gone. We never see them and can’t get them back for you, so download your result before you leave.
            </p>
          </Section>

          <Section title="What we don’t collect">
            <p>
              There are no accounts to sign up for, and snappdf sets no cookies. There are no analytics, tracking scripts, ads or social media
              widgets. Everything the page needs, including its fonts, comes from snappdf’s own domain, so loading it doesn’t tell any other company
              you visited.
            </p>
          </Section>

          <Section title="What the server sees">
            <p>
              snappdf is hosted on Google Cloud. Like any website, when your browser asks for the app, Google Cloud’s servers receive the basic
              details every web request carries: your IP address, your browser and device type, the address you asked for and the time. These
              request logs exist to deliver the site and keep it running. They never contain your files, and we don’t use them to identify or follow
              you. Google’s handling of its own infrastructure is covered by{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className={link}>
                Google’s privacy policy
              </a>
              .
            </p>
          </Section>

          <Section title="Working offline">
            <p>
              So snappdf can open with no internet, your browser keeps a copy of the app itself: its code, fonts and icons. That copy never includes
              your documents. You can remove it any time by clearing this site’s data in your browser settings.
            </p>
          </Section>

          <Section title="Bug reports and feature requests">
            <p>
              If you use the{' '}
              <a href="/report" className={link}>
                report form
              </a>
              , what you type is emailed privately to the person who maintains snappdf, through{' '}
              <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer" className={link}>
                Resend
              </a>
              , the service that delivers the email. That’s only the fields you fill in, plus your email address if you choose to leave one so we
              can reply. Nothing about your files or device is included, and reports aren’t published anywhere.
            </p>
            <p>
              To stop spam, the server briefly remembers the address a report came from, for at most 10 minutes, so one address can’t send
              hundreds. It isn’t saved anywhere or added to the email.
            </p>
          </Section>

          <Section title="Links to other sites">
            <p>
              snappdf links to a few other websites, such as GitHub. When you follow those links, that site’s own privacy policy applies, not this
              one.
            </p>
          </Section>

          <Section title="Don’t just take our word for it">
            <p>
              snappdf is open source. Anyone can read the code on{' '}
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={link}>
                GitHub
              </a>{' '}
              and check that it does what this page says. You can also try it yourself: load a tool, turn on airplane mode, and keep working.
            </p>
          </Section>

          <Section title="Changes and questions">
            <p>
              If this policy changes, the date at the top will change with it, and the change will be visible in the project’s history on GitHub.
              Questions are welcome through the{' '}
              <a href="/report" className={link}>
                report form
              </a>
              .
            </p>
          </Section>
        </div>
      </article>
    </SitePage>
  );
}
