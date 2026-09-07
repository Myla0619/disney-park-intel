/** 围绕最强项目或查询匹配提取可读片段。 */
export function reviewSnippet(text: string, terms: string[], maxLength = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= maxLength) return clean;

  const needles = [...new Set(terms.flatMap(expandSnippetTerm).filter((x) => x.length >= 2))]
    .sort((a, b) => b.length - a.length);
  const lower = clean.toLocaleLowerCase();
  let best = { index: -1, length: 0, score: -1 };
  for (const needle of needles) {
    let from = 0;
    const key = needle.toLocaleLowerCase();
    while (from < lower.length) {
      const index = lower.indexOf(key, from);
      if (index < 0) break;
      const score = key.length * 10 + contextScore(lower, index, maxLength, needles);
      if (score > best.score) best = { index, length: key.length, score };
      from = index + Math.max(1, key.length);
    }
  }
  if (best.index < 0) return `…${clean.slice(0, maxLength - 1).trimEnd()}`;

  let start = Math.max(0, best.index - Math.floor((maxLength - best.length) / 2));
  let end = Math.min(clean.length, start + maxLength);
  start = Math.max(0, end - maxLength);
  // 优先在附近标点处截断，并保留命中的文字。
  const left = clean.slice(start, best.index).search(/[^。！？；.!?;]{0,24}$/);
  if (start > 0 && left >= 0) start += left;
  const boundary = clean.slice(best.index + best.length, end).search(/[。！？；.!?;]/);
  if (boundary >= 0) end = Math.min(end, best.index + best.length + boundary + 1);
  const body = clean.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${body}${end < clean.length ? "…" : ""}`;
}

export function reviewMatches(text: string, terms: string[]): boolean {
  const lower = text.toLocaleLowerCase();
  return [...new Set(terms.flatMap(expandTerm).filter((x) => x.length >= 2))]
    .some((term) => lower.includes(term.toLocaleLowerCase()));
}

function expandTerm(term: string): string[] {
  const parts = term.toLocaleLowerCase().match(/[\p{Script=Han}]{2,}|[a-z0-9]{2,}/gu) ?? [];
  const generic = /上海|迪士尼|乐园|项目|餐厅|攻略|排队|多久|值得吗|值得玩吗/g;
  const distinctive = parts
    .map((part) => part.replace(generic, ""))
    .filter((part) => /[\p{Script=Han}]/u.test(part) ? part.length >= 3 : part.length >= 2);
  // 不再生成任意二字片段，避免泛攻略碰巧出现「动物」「热力」就被错归到具体项目。
  return [...parts, ...distinctive];
}

function expandSnippetTerm(term: string): string[] {
  const strict = expandTerm(term);
  const queryWords = term.toLocaleLowerCase()
    .replace(/适合|是否|可以|能不能|怎么样|怎么|为什么|值得|好不好|吗|呢|啊|么/g, " ")
    .match(/[\p{Script=Han}]{2,}|[a-z0-9]{2,}/gu) ?? [];
  return [...strict, ...queryWords];
}

function contextScore(text: string, index: number, maxLength: number, terms: string[]): number {
  const window = text.slice(Math.max(0, index - maxLength / 2), index + maxLength / 2);
  return terms.reduce((sum, term) => sum + (window.includes(term.toLocaleLowerCase()) ? Math.min(term.length, 8) : 0), 0);
}
