const DEFAULT_USER_LABELS = ['user', 'you', '用户'];
const DEFAULT_ASSISTANT_LABELS = ['assistant', 'ai', 'chatgpt', 'gpt', '助手'];

const normalizeLabel = (s) => s.trim().toLowerCase();

export const normalizePlainText = (input) => {
  let text = String(input ?? '').replace(/\r\n?/g, '\n');
  // Markdown -> plain text. Preserve meaning-bearing text and line breaks.
  text = text.replace(/^\s*```[^\n]*\n?/gm, '');
  text = text.replace(/^\s*```\s*$/gm, '');
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
  text = text.replace(/`([^`\n]+)`/g, '$1');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  // Light punctuation/spacing normalization only; never rewrite content.
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\s+([,.;!?，。！？；：])/g, '$1');
  text = text.replace(/([（(])\s+/g, '$1').replace(/\s+([）)])/g, '$1');
  return text.trim();
};

const splitRoleLine = (line) => {
  // Accept ':' and Chinese '：'. Keep the content after the first delimiter.
  const match = line.match(/^\s*([^:：\n]{1,40})\s*[:：]\s*(.*)$/);
  if (!match) return null;
  return {label: match[1].trim(), inline: match[2] ?? ''};
};

export const parseDialogue = (raw, options = {}) => {
  const userLabels = new Set([...DEFAULT_USER_LABELS, ...(options.userLabels ?? [])].map(normalizeLabel));
  const assistantLabels = new Set([...DEFAULT_ASSISTANT_LABELS, ...(options.assistantLabels ?? [])].map(normalizeLabel));
  const lines = String(raw ?? '').replace(/\r\n?/g, '\n').split('\n');
  const messages = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const text = normalizePlainText(current.parts.join('\n'));
    if (text) {
      messages.push({
        id: `m${messages.length + 1}`,
        speaker: current.speaker,
        name: current.name ?? null,
        text,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const role = splitRoleLine(line);
    if (role) {
      const key = normalizeLabel(role.label);
      let speaker = null;
      if (userLabels.has(key)) speaker = 'user';
      if (assistantLabels.has(key)) speaker = 'assistant';
      if (speaker) {
        flush();
        const explicitName = speaker === 'user' ? options.userName : options.assistantName;
        current = {speaker, name: explicitName ?? null, parts: []};
        if (role.inline.trim()) current.parts.push(role.inline);
        continue;
      }
    }
    // Also support role label on a line by itself, e.g. "用户" then next line text.
    const key = normalizeLabel(line.replace(/[：:]\s*$/, ''));
    if (userLabels.has(key) || assistantLabels.has(key)) {
      flush();
      const speaker = userLabels.has(key) ? 'user' : 'assistant';
      const explicitName = speaker === 'user' ? options.userName : options.assistantName;
      current = {speaker, name: explicitName ?? null, parts: []};
      continue;
    }

    if (!current) {
      if (!line.trim()) continue;
      throw new Error(`Unlabeled dialogue content before the first role: "${line.trim()}". Use User:/AI: or 用户:/AI:.`);
    }
    current.parts.push(line);
  }
  flush();

  if (!messages.length) {
    throw new Error('No dialogue messages were found. Use role labels such as User:/AI: or 用户:/AI:.');
  }
  if (!messages.some((m) => m.speaker === 'user')) {
    throw new Error('Dialogue must contain at least one user message.');
  }
  if (!messages.some((m) => m.speaker === 'assistant')) {
    throw new Error('Dialogue must contain at least one assistant/AI message.');
  }
  return messages;
};
