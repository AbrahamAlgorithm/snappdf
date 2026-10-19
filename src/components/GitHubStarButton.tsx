import { GitHubMark } from '@/components/brand';
import { GITHUB_URL } from '@/lib/site';
import { cn } from '@/lib/utils';

export function GitHubStarButton({ className, label = 'Star' }: { className?: string; label?: string }) {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-xl bg-subtle px-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-line',
        className,
      )}
    >
      <GitHubMark className="size-4" />
      {label}
    </a>
  );
}
