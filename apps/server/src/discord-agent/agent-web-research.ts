import { AgentBehavior } from './agent-behavior';

export function isExplicitWebRequest(prompt: string): boolean {
  let fence: string | undefined;
  for (const line of prompt.split(/\r?\n/)) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !line.slice(delimiter[0].length).trim()) fence = undefined;
      continue;
    }
    if (fence || /^\s*>/.test(line)) continue;
    // Conservative: a negated line never grants research, even if another phrase matches.
    if (/\b(jangan|tanpa|tidak|do\s+not|don['’]t|without|never)\b/i.test(line)) continue;
    if (/\b(cari\s+di\s+(web|internet)|telusuri\s+web|cari\s+berita|cek\s+sumber|search\s+(the\s+web|online)|look\s+up\s+online|find\s+sources)\b/i.test(line)) return true;
    if (/\b(baca|buka|cek|read|open|fetch|check)\b[^\r\n]{0,120}https?:\/\/\S+/i.test(line)) return true;
  }
  return false;
}
export function canResearchWeb(policy: AgentBehavior['webResearchPolicy'], prompt: string): boolean {
  return policy === 'AUTO' || isExplicitWebRequest(prompt);
}
export function isBuiltinWebTool(name: string): boolean { return name === 'web_search' || name === 'web_fetch'; }
