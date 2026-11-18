// Markdown task-list progress ("- [ ]" / "- [x]") from an issue body.
export type Checklist = { done: number; total: number };

const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s/;

export function checklistProgress(description: string): Checklist | null {
  if (typeof description !== 'string' || description.length === 0) return null;
  let done = 0;
  let total = 0;
  let fenced = false;
  for (const line of description.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = ITEM.exec(line);
    if (!m) continue;
    total += 1;
    if (m[1] !== ' ') done += 1;
  }
  return total > 0 ? { done, total } : null;
}
