import { useEffect } from 'react';
import { GitHubMark, Logo } from '@/components/brand';
import { PrivacyChip, ToolIcon } from '@/components/toolkit';
import { toolHref } from '@/lib/router';
import { GITHUB_URL, TOOL_GROUPS, TOOLS } from '@/lib/site';
import { useToolsInProgress } from '@/lib/work';

export default function Tools() {
  const inProgress = useToolsInProgress();

  // preload the editors while people pick, so a tool opens instantly
  useEffect(() => {
    const id = setTimeout(() => void import('@/pages/Workspace'), 800);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" aria-label="snappdf home" className="rounded-md">
            <Logo />
          </a>
          <div className="flex items-center gap-2">
            <PrivacyChip className="hidden sm:inline-flex" />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="snappdf on GitHub"
              title="snappdf on GitHub"
              className="grid size-10 place-items-center rounded-full text-ink/70 transition-colors hover:bg-subtle hover:text-ink"
            >
              <GitHubMark className="size-[18px]" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
        <h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[48px]">What do you need to do?</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink/60 sm:text-[17px]">Choose a tool to get started.</p>

        {TOOL_GROUPS.map((group) => (
          <section key={group} aria-label={group} className="mt-10 sm:mt-14">
            <h2 className="text-[14px] font-medium text-ink/50">{group}</h2>
            <ul className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2 lg:grid-cols-4">
              {TOOLS.filter((tool) => tool.group === group).map((tool) => (
                <li key={tool.id}>
                  <a
                    href={toolHref(tool.id)}
                    className="flex h-full items-center gap-4 rounded-[22px] border border-line bg-card p-4 transition-[border-color,box-shadow] hover:border-ink/15 hover:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.22)] sm:flex-col sm:items-start sm:p-5"
                  >
                    <ToolIcon tool={tool} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] font-semibold tracking-[-0.02em] sm:mt-1">
                        {tool.name}
                        {inProgress.includes(tool.id) && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2 py-0.5 text-[12px] font-medium tracking-normal text-ink/65">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: tool.color }} />
                            In progress
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-[14px] leading-snug text-ink/55">{tool.description}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-14 text-[14px] text-ink/45">More PDF tools are on the way.</p>
      </main>
    </div>
  );
}
