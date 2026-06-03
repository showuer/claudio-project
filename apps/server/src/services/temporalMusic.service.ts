export type TemporalEnergy = 'bright' | 'steady' | 'flexible' | 'gentle' | 'quiet-gentle';

export interface TemporalMusicProfile {
  id: string;
  label: string;
  timeRange: string;
  energy: TemporalEnergy;
  selectionBias: string;
  introBias: string;
  searchTerms: string[];
}

function parseHour(input?: string | Date): number {
  if (input instanceof Date) return input.getHours();
  if (typeof input === 'string') {
    const match = input.match(/\b(\d{1,2}):\d{2}\b/);
    if (match) return Math.max(0, Math.min(23, Number(match[1])));
  }
  return new Date().getHours();
}

export function getTemporalMusicProfile(input?: string | Date): TemporalMusicProfile {
  const hour = parseHour(input);

  if (hour >= 5 && hour < 9) {
    return {
      id: 'morning',
      label: '早晨',
      timeRange: '05:00-09:00',
      energy: 'bright',
      selectionBias: '清爽、干净、轻快，可以有一点启动感，但不要一上来就太冲。',
      introBias: '可以写一天刚开始的状态，但不要硬套励志话术。',
      searchTerms: ['清晨 轻快 华语', 'morning acoustic pop', '日系 清晨 流行'],
    };
  }
  if (hour >= 9 && hour < 12) {
    return {
      id: 'forenoon',
      label: '上午',
      timeRange: '09:00-12:00',
      energy: 'steady',
      selectionBias: '稳定、专注、有推进感，避免抢注意力的强烈副歌和太吵的编曲。',
      introBias: '更像陪着进入工作流，不要过度抒情。',
      searchTerms: ['专注 工作 city pop', 'focus indie pop', '轻节奏 R&B'],
    };
  }
  if (hour >= 12 && hour < 14) {
    return {
      id: 'noon',
      label: '中午',
      timeRange: '12:00-14:00',
      energy: 'gentle',
      selectionBias: '放松、舒服、留白，适合吃饭或短暂休息；不要写成夜里或睡前。',
      introBias: '必须是中午语境，不要说夜里、晚安、睡前。',
      searchTerms: ['午后 放松 华语 R&B', 'noon chill pop', '轻松 acoustic'],
    };
  }
  if (hour >= 14 && hour < 18) {
    return {
      id: 'afternoon',
      label: '下午',
      timeRange: '14:00-18:00',
      energy: 'steady',
      selectionBias: '可以有律动和城市感，但整体要稳，别像派对或健身房。',
      introBias: '可以写继续推进事情的感觉，不要把人往亢奋里推。',
      searchTerms: ['下午 工作 律动 R&B', 'afternoon groove pop', '城市感 流行'],
    };
  }
  if (hour >= 18 && hour < 21) {
    return {
      id: 'evening',
      label: '傍晚',
      timeRange: '18:00-21:00',
      energy: 'flexible',
      selectionBias: '从白天收回来，可以温暖、有陪伴感，也可以保留一点旋律和律动。',
      introBias: '更像把白天放下，不要突然转成睡前语气。',
      searchTerms: ['傍晚 放松 华语', 'evening warm pop', '日落 chill'],
    };
  }
  if (hour >= 21 && hour < 24) {
    return {
      id: 'night',
      label: '晚上',
      timeRange: '21:00-24:00',
      energy: 'gentle',
      selectionBias: '整体比白天更缓和一点，可以有轻音乐、温柔 R&B、轻摇滚或带律动的歌，但不要默认推特别兴奋、爆裂或夜店感的歌；用户明确要兴奋时再放开。',
      introBias: '可以有夜晚感，但不要固定成“睡前/晚安/夜里小广播”。',
      searchTerms: ['晚上 温柔 R&B', 'night mellow pop', '轻音乐 夜晚'],
    };
  }
  return {
    id: 'late-night',
    label: '凌晨',
    timeRange: '00:00-05:00',
    energy: 'quiet-gentle',
    selectionBias: '凌晨默认更克制、更柔和，可以是 ambient、钢琴、lofi、轻声人声或慢一点的 R&B；不是禁止律动，而是避免无请求地推派对、强 EDM、爆裂副歌和很冲的说唱。',
    introBias: '低声一点，不要提神、打鸡血，也不要每次都说睡觉。',
    searchTerms: ['凌晨 安静 轻音乐', 'late night mellow R&B', 'lofi sleep chill'],
  };
}

export function formatTemporalMusicGuidance(input?: string | Date): string {
  const profile = getTemporalMusicProfile(input);
  return [
    `Time slot: ${profile.label} (${profile.timeRange})`,
    `Energy tendency: ${profile.energy}`,
    `Selection bias: ${profile.selectionBias}`,
    `Intro bias: ${profile.introBias}`,
    'This is a soft prior, not a hard ban. If the user explicitly asks for high energy, respect the request while still avoiding jarring sequencing.',
  ].join('\n');
}

export function getTemporalSearchTerms(input?: string | Date): string[] {
  return getTemporalMusicProfile(input).searchTerms;
}
