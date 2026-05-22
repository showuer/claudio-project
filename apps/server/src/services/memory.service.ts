import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playsRepo } from '../db/plays.repo.js';

export type MemoryMode = 'chat' | 'music' | 'aidj' | 'profile';

export interface MemoryStats {
  totalHours: number;
  totalPlays: number;
  topArtists: Array<{ artist: string; count: number }>;
}

export interface MemorySummary {
  tags: string[];
  topArtists: string[];
  mood: string;
  copy: string;
  philosophy: string;
  totalHours: number;
  totalPlays: number;
  avoid: string[];
  routines: string[];
}

export interface SearchHints {
  preferredArtists: string[];
  tags: string[];
  avoid: string[];
  mood: string;
  routines: string[];
}

export interface ClaudioMemoryService {
  getEditableProfile(): Promise<{ content: string }>;
  saveEditableProfile(content: string): Promise<{ saved: true }>;
  getPromptMemory(userMessage: string, mode?: MemoryMode): Promise<string>;
  getSummary(): Promise<MemorySummary>;
  updateStyleTags(tags: string[]): Promise<{ saved: true; tags: string[] }>;
  addTastePreference(preference: string): Promise<{ saved: true; added: boolean; preference: string }>;
  updateMood(mood: string): Promise<{ saved: true; mood: string }>;
  getSearchHints(): Promise<SearchHints>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_USER_DIR = path.join(ROOT_DIR, 'user');
const DEFAULT_APPS_USER_DIR = path.join(ROOT_DIR, 'apps', 'user');
const PROFILE_FILE = 'memory.profile.md';

const SECTION_NAMES = [
  'Identity',
  'Manual Overrides',
  'Taste',
  'Dislikes And Boundaries',
  'Mood',
  'Routines',
  'Listening Stats',
  'Learned Preferences',
  'Recent Context',
  'Search And Recommendation Rules',
] as const;

function readSafe(filePath: string, fallback = ''): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function writeSafe(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function cleanBullet(line: string): string {
  return line.replace(/^[-*]\s*/, '').trim();
}

function bulletLines(text: string): string[] {
  return text
    .split('\n')
    .map(cleanBullet)
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));
}

function demoteUnknownLevelTwoHeadings(content: string): string {
  const known = new Set<string>(SECTION_NAMES);
  return content
    .split('\n')
    .map((line) => {
      const match = line.match(/^##\s+(.+?)\s*$/);
      if (!match) return line;
      return known.has(match[1]) ? line : `### ${match[1]}`;
    })
    .join('\n');
}

function getLegacySection(content: string, heading: string): string {
  const match = content.match(new RegExp(`(?:^|\\n)##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`));
  return match ? match[1].trim() : '';
}

function removeLegacySection(content: string, heading: string): string {
  return content.replace(new RegExp(`\\n?##\\s+${heading}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`), '').trim();
}

function getNestedSection(content: string, heading: string): string {
  const match = content.match(new RegExp(`(?:^|\\n)###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+|$)`));
  return match ? match[1].trim() : '';
}

function getTastePreferenceText(taste: string): string {
  return getNestedSection(taste, '风格偏好') || taste;
}

function appendNestedPreference(taste: string, preference: string): string {
  const clean = preference.trim();
  if (!clean || taste.includes(clean)) return taste;
  const sectionRe = /(^|\n)###\s+风格偏好\s*\n([\s\S]*?)(?=\n###\s+|$)/;
  if (sectionRe.test(taste)) {
    return taste.replace(sectionRe, (match) => `${match.trimEnd()}\n- ${clean}`);
  }
  return `${taste.trimEnd()}\n\n### 风格偏好\n- ${clean}`;
}

function uniq(items: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items.map((v) => v.trim()).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeTag(tag: string): string {
  const trimmed = tag.trim();
  if (!trimmed) return '';
  if (/^[a-z0-9&\-\s]+$/i.test(trimmed)) return trimmed.toUpperCase().replace(/\s+/g, ' ');
  return trimmed;
}

function extractSection(content: string, name: string): string {
  const match = content.match(new RegExp(`(?:^|\\n)## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match ? match[1].trim() : '';
}

function replaceSection(content: string, name: string, body: string): string {
  const section = `## ${name}\n${body.trim()}\n`;
  const re = new RegExp(`## ${name}\\n[\\s\\S]*?(?=\\n## |$)`);
  if (re.test(content)) return content.replace(re, section.trimEnd());
  return `${content.trimEnd()}\n\n${section}`.trimEnd() + '\n';
}

function ensureSections(content: string): string {
  let next = demoteUnknownLevelTwoHeadings(content).trim() || '# Claudio Memory Profile';
  if (!next.startsWith('# Claudio Memory Profile')) {
    next = `# Claudio Memory Profile\n\n## Identity\n${next}`;
  }
  for (const section of SECTION_NAMES) {
    if (!new RegExp(`^## ${section}\\n`, 'm').test(next)) {
      next = `${next.trimEnd()}\n\n## ${section}\n- 无\n`;
    }
  }
  return next.trimEnd() + '\n';
}

function buildInitialProfile(userDir: string, appsUserDir: string): string {
  const legacyTaste = readSafe(path.join(userDir, 'taste.md'), '# 我的音乐品味\n- 喜欢自然、有情绪连接的歌').trim();
  const taste = demoteUnknownLevelTwoHeadings(removeLegacySection(legacyTaste, '不喜欢的')).trim();
  const legacyDislikes = bulletLines(getLegacySection(legacyTaste, '不喜欢的'));
  const routines = demoteUnknownLevelTwoHeadings(readSafe(path.join(userDir, 'routines.md'), '- 全天都可以听歌，但深夜更需要陪伴感')).trim();
  const mood = readSafe(path.join(userDir, 'mood.md'), readSafe(path.join(appsUserDir, 'mood.md'), '平静')).trim();

  return ensureSections([
    '# Claudio Memory Profile',
    '',
    '## Identity',
    '- Claudio 是一个私人 AI 电台和 AIDJ，语气像真实 FM 男主播。',
    '',
    '## Manual Overrides',
    '- 只有用户明确有放歌、搜歌、推歌需求时才推歌。',
    '- 推歌必须先生成一段完整 intro。',
    '',
    '## Taste',
    taste,
    '',
    '## Dislikes And Boundaries',
    '- 不要为了显得懂音乐而百科式解释。',
    ...legacyDislikes.map((line) => `- ${line}`),
    '',
    '## Mood',
    `- ${mood || '平静'}`,
    '',
    '## Routines',
    routines,
    '',
    '## Listening Stats',
    '- 由播放记录自动生成。',
    '',
    '## Learned Preferences',
    '- 由喜欢、播放、跳过和搜索行为自动生成。',
    '',
    '## Recent Context',
    '- 暂无。',
    '',
    '## Search And Recommendation Rules',
    '- 搜歌先提取歌手、歌名或场景核心词，再查找可播放歌曲。',
    '',
  ].join('\n'));
}

function firstMeaningfulLine(text: string, fallback = ''): string {
  return bulletLines(text)[0] || fallback;
}

function buildPromptSummary(profile: string, stats: MemoryStats, mode: MemoryMode, userMessage: string): string {
  const manual = extractSection(profile, 'Manual Overrides');
  const taste = extractSection(profile, 'Taste');
  const avoid = extractSection(profile, 'Dislikes And Boundaries');
  const mood = extractSection(profile, 'Mood');
  const routines = extractSection(profile, 'Routines');
  const recent = extractSection(profile, 'Recent Context');
  const rules = extractSection(profile, 'Search And Recommendation Rules');
  const top = stats.topArtists.slice(0, 6).map((a) => `${a.artist}(${a.count})`).join('、') || '暂无';

  return [
    '## Claudio Memory For This Reply',
    `Mode: ${mode}`,
    `User request: ${userMessage.slice(0, 120)}`,
    '',
    'Manual Overrides:',
    manual || '- 无',
    '',
    'Current Mood:',
    mood || '- 平静',
    '',
    'Taste:',
    taste || '- 喜欢有情绪连接的音乐',
    '',
    'Routines:',
    routines || '- 全天可听歌',
    '',
    'Learned Listening Pattern:',
    `- Total plays: ${stats.totalPlays}`,
    `- Top artists: ${top}`,
    '',
    'Avoid:',
    avoid || '- 无',
    '',
    'Recommendation Strategy:',
    rules || '- 明确要歌时才推歌；intro 像真实 FM，不逐首介绍。',
    '',
    'Recent Context:',
    recent || '- 无',
  ].join('\n').slice(0, 1800);
}

export function createMemoryService(options?: {
  userDir?: string;
  appsUserDir?: string;
  getStats?: () => Promise<MemoryStats>;
}): ClaudioMemoryService {
  const userDir = options?.userDir || DEFAULT_USER_DIR;
  const appsUserDir = options?.appsUserDir || DEFAULT_APPS_USER_DIR;
  const getStats = options?.getStats || playsRepo.getStats.bind(playsRepo);
  const profilePath = path.join(userDir, PROFILE_FILE);

  async function loadProfile(): Promise<string> {
    if (!fs.existsSync(profilePath)) {
      const initial = buildInitialProfile(userDir, appsUserDir);
      writeSafe(profilePath, initial);
      return initial;
    }
    const normalized = ensureSections(readSafe(profilePath));
    writeSafe(profilePath, normalized);
    return normalized;
  }

  async function getEditableProfile() {
    return { content: await loadProfile() };
  }

  async function saveEditableProfile(content: string) {
    writeSafe(profilePath, ensureSections(content));
    return { saved: true as const };
  }

  async function getPromptMemory(userMessage: string, mode: MemoryMode = 'chat') {
    const [profile, stats] = await Promise.all([loadProfile(), getStats()]);
    return buildPromptSummary(profile, stats, mode, userMessage);
  }

  async function getSummary(): Promise<MemorySummary> {
    const [profile, stats] = await Promise.all([loadProfile(), getStats()]);
    const tasteText = extractSection(profile, 'Taste');
    const tasteLines = bulletLines(getTastePreferenceText(tasteText));
    const avoid = bulletLines(extractSection(profile, 'Dislikes And Boundaries')).slice(0, 6);
    const routines = bulletLines(extractSection(profile, 'Routines')).slice(0, 6);
    const identity = extractSection(profile, 'Identity');
    const manual = extractSection(profile, 'Manual Overrides');

    const tags = tasteLines.flatMap((line) => line.split(/[：:、,，]/).map((part) => part.trim())).filter(Boolean);

    return {
      tags: uniq(tags, 12),
      topArtists: stats.topArtists.slice(0, 6).map((a) => a.artist),
      mood: firstMeaningfulLine(extractSection(profile, 'Mood'), ''),
      copy: firstMeaningfulLine(identity, 'Your private AI DJ.'),
      philosophy: firstMeaningfulLine(manual, ''),
      totalHours: stats.totalHours || 0,
      totalPlays: stats.totalPlays || 0,
      avoid,
      routines,
    };
  }

  async function updateStyleTags(tags: string[]) {
    const clean = uniq(tags.map(normalizeTag).filter(Boolean), 12);
    const profile = await loadProfile();
    const body = clean.length > 0 ? clean.map((tag) => `- ${tag}`).join('\n') : '- 有情绪连接的音乐';
    writeSafe(profilePath, replaceSection(profile, 'Taste', body));
    return { saved: true as const, tags: clean };
  }

  async function addTastePreference(preference: string) {
    const clean = preference.trim();
    if (!clean) return { saved: true as const, added: false, preference: clean };
    const profile = await loadProfile();
    const taste = extractSection(profile, 'Taste');
    const nextTaste = appendNestedPreference(taste, clean);
    if (nextTaste === taste) return { saved: true as const, added: false, preference: clean };
    writeSafe(profilePath, replaceSection(profile, 'Taste', nextTaste));
    return { saved: true as const, added: true, preference: clean };
  }

  async function updateMood(mood: string) {
    const clean = mood.trim();
    const profile = await loadProfile();
    writeSafe(profilePath, replaceSection(profile, 'Mood', clean ? `- ${clean}` : '- 平静'));
    return { saved: true as const, mood: clean };
  }

  async function getSearchHints(): Promise<SearchHints> {
    const [profile, stats] = await Promise.all([loadProfile(), getStats()]);
    const taste = bulletLines(getTastePreferenceText(extractSection(profile, 'Taste')));
    const topArtists = stats.topArtists.map((a) => a.artist);
    return {
      preferredArtists: uniq([...topArtists, ...taste.filter((line) => line.length <= 20)], 12),
      tags: uniq(taste, 12),
      avoid: bulletLines(extractSection(profile, 'Dislikes And Boundaries')).slice(0, 12),
      mood: firstMeaningfulLine(extractSection(profile, 'Mood'), ''),
      routines: bulletLines(extractSection(profile, 'Routines')).slice(0, 8),
    };
  }

  return {
    getEditableProfile,
    saveEditableProfile,
    getPromptMemory,
    getSummary,
    updateStyleTags,
    addTastePreference,
    updateMood,
    getSearchHints,
  };
}

export const memoryService = createMemoryService();
