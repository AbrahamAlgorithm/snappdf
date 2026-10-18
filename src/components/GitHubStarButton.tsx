import { useEffect, useState } from 'react';
import { GitHubMark } from '@/components/brand';
import { GITHUB_REPO, GITHUB_URL } from '@/lib/site';
import { cn } from '@/lib/utils';

const CACHE_KEY = 'snappdf:github-stars';

// github rate limits us, so cache the star count for the session
function useGitHubStars() {
  const [stars, setStars] = useState<number | null>(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? Number(cached) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (stars !== null) return;
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.stargazers_count !== 'number') return;
        setStars(data.stargazers_count);
        try {
          sessionStorage.setItem(CACHE_KEY, String(data.stargazers_count));
        } catch {
          // no storage (private mode), skip the cache
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [stars]);

  return stars;
}

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function GitHubStarButton({ className, label = 'Star' }: { className?: string; label?: string }) {
  const stars = useGitHubStars();

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
      {stars !== null && <span className="font-mono text-[13px] text-ink/50">{formatCount(stars)}</span>}
    </a>
  );
}
