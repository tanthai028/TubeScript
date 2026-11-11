import type { Segment } from './extractor/types.ts';

/** 75_000 → "1:15", 3_725_000 → "1:02:05". Uses h:mm:ss when `forceHours` (keeps a long list aligned). */
export function formatTimestamp(ms: number, forceHours = false): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0 || forceHours) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** A pause this long between captions starts a new paragraph. */
const PARAGRAPH_GAP_MS = 2000;
/** Past this length, a paragraph also ends at the next sentence end. */
const PARAGRAPH_SOFT_MAX = 500;
/** Shorter paragraphs when each one gets a timestamp, so timestamps stay useful (every ~10-15 s). */
const TIMESTAMPED_SOFT_MAX = 200;

export interface Paragraph {
  startMs: number;
  text: string;
}

/**
 * Captions are short screen-width fragments, so exports join them into paragraphs: a new one
 * starts at a speaker change (">>"), a long pause, or a sentence end once the paragraph is long.
 * Text is never changed, only the whitespace between captions.
 */
export function groupParagraphs(segments: readonly Segment[], softMax = PARAGRAPH_SOFT_MAX): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  let prevEnd = -Infinity;
  for (const s of segments) {
    const breakHere =
      current !== null &&
      (s.text.startsWith('>>') ||
        s.startMs - prevEnd >= PARAGRAPH_GAP_MS ||
        (current.text.length >= softMax && /[.!?…]["')\]]?$/.test(current.text)));
    if (breakHere) {
      paragraphs.push(current!);
      current = null;
    }
    current = current ? { startMs: current.startMs, text: `${current.text} ${s.text}` } : { startMs: s.startMs, text: s.text };
    prevEnd = s.startMs + s.durMs;
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

export function transcriptToParagraphs(segments: readonly Segment[]): string[] {
  return groupParagraphs(segments).map((p) => p.text);
}

/**
 * Paragraphs separated by a blank line. With timestamps, shorter paragraphs, each starting with
 * "[m:ss] " (the time of its first caption). Text is never changed.
 */
export function transcriptToText(segments: readonly Segment[], timestamps: boolean): string {
  if (!timestamps) return transcriptToParagraphs(segments).join('\n\n');
  const hours = segments.some((s) => s.startMs >= 3_600_000);
  return groupParagraphs(segments, TIMESTAMPED_SOFT_MAX)
    .map((p) => `[${formatTimestamp(p.startMs, hours)}] ${p.text}`)
    .join('\n\n');
}

export interface ExportMeta {
  title: string;
  videoId: string;
  trackLabel: string;
}

/** TXT download: a short header so the file makes sense on its own, then the transcript. */
export function transcriptFile(segments: readonly Segment[], timestamps: boolean, meta: ExportMeta): string {
  const header = [meta.title, `https://www.youtube.com/watch?v=${meta.videoId}`, `Captions: ${meta.trackLabel}`, ''];
  return [...header, transcriptToText(segments, timestamps), ''].join('\n');
}

/** Safe on Windows, macOS and Linux; keeps the video ID so files never collide. */
export function transcriptFilename(meta: ExportMeta): string {
  const title = meta.title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/, '');
  return `${title || 'transcript'} [${meta.videoId}].txt`;
}
