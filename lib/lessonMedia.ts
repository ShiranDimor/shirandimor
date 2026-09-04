// מחלץ YouTube video id מכל צורת לינק נפוצה (youtu.be, watch?v=, embed/, shorts/) - או מקבל id גולמי כמו שהוא
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null;
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    const match = url.pathname.match(/\/(embed|shorts)\/([\w-]{11})/);
    if (match) return match[2];
  } catch {
    return null;
  }
  return null;
}

// מקבל או לינק ישיר למצגת Gamma, או קוד ה-embed המלא (<iframe src="...">) שגמא נותנת
// ב-Share -> Embed - וב-2 המקרים מחזיר את כתובת ה-iframe הסופית להטמעה.
export function extractGammaEmbedSrc(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const iframeMatch = trimmed.match(/src=["']([^"']+)["']/);
  const candidate = iframeMatch ? iframeMatch[1] : trimmed;

  try {
    const url = new URL(candidate);
    if (!url.hostname.endsWith('gamma.app')) return null;
    return url.toString();
  } catch {
    return null;
  }
}
