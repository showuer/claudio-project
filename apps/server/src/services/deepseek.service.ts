import { config } from '../config.js';

interface DeepSeekOutput {
  say: string;
  play: Array<{ id: string; name: string; artist: string }>;
  segue: string;
}

export const deepseekService = {
  async *chat(messages: Array<{ role: string; content: string }>): AsyncGenerator<string> {
    const resp = await fetch(`${config.DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.DEEPSEEK_MODEL,
        messages,
        max_tokens: 8192,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        stream: true,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      throw new Error(`DeepSeek API error: ${resp.status}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch { /* skip malformed chunks */ }
      }
    }
  },

  async chatComplete(messages: Array<{ role: string; content: string }>): Promise<DeepSeekOutput> {
    let fullText = '';
    for await (const chunk of deepseekService.chat(messages)) {
      fullText += chunk;
    }

    // Try to parse the full JSON output
    try {
      return JSON.parse(fullText) as DeepSeekOutput;
    } catch {
      // Fallback: try to extract JSON from text
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as DeepSeekOutput;
        } catch { /* will fall through */ }
      }

      // Last resort fallback
      return {
        say: '来听几首歌吧。',
        play: [],
        segue: '',
      };
    }
  },
};
