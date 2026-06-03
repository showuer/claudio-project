import { useEffect, useState } from 'react';

const coverDetailCache = new Map<string, string>();
const coverDetailInflight = new Map<string, Promise<string>>();

function fetchCoverDetail(songId: string) {
  const cached = coverDetailCache.get(songId);
  if (cached !== undefined) return Promise.resolve(cached);

  const inflight = coverDetailInflight.get(songId);
  if (inflight) return inflight;

  const request = fetch(`/api/player/detail/${encodeURIComponent(songId)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((detail) => {
      const coverUrl = detail?.coverUrl || '';
      coverDetailCache.set(songId, coverUrl);
      return coverUrl;
    })
    .catch(() => {
      coverDetailCache.set(songId, '');
      return '';
    })
    .finally(() => {
      coverDetailInflight.delete(songId);
    });

  coverDetailInflight.set(songId, request);
  return request;
}

export function useResolvedCoverUrl(songId?: string, coverUrl?: string) {
  const [resolvedCoverUrl, setResolvedCoverUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    setResolvedCoverUrl('');
    if (!songId || coverUrl) return () => { cancelled = true; };

    fetchCoverDetail(songId).then((nextCoverUrl) => {
      if (!cancelled) setResolvedCoverUrl(nextCoverUrl);
    });

    return () => { cancelled = true; };
  }, [songId, coverUrl]);

  return coverUrl || resolvedCoverUrl;
}
