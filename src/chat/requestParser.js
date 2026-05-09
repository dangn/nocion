const JIRA_KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/;

const COMMANDS = new Set(['init', 'ingest', 'query', 'lint', 'status', 'switch', 'all']);

function parseRequest(request) {
  const rawPrompt = String(request.prompt || '').trim();
  let prompt = rawPrompt;
  let command = request.command ? String(request.command).replace(/^\//, '') : undefined;

  if (!command) {
    const slash = prompt.match(/^\/([a-zA-Z][\w-]*)(?:\s+|$)/);
    if (slash) {
      command = slash[1].toLowerCase();
      prompt = prompt.slice(slash[0].length).trim();
    }
  }

  const wikiResult = extractKeyValue(prompt, 'wiki');
  prompt = wikiResult.text;
  const pathResult = extractKeyValue(prompt, 'path');
  prompt = pathResult.text;
  const domainResult = extractKeyValue(prompt, 'domain');
  prompt = domainResult.text;

  if (!command) {
    command = inferCommand(prompt);
  }

  if (!COMMANDS.has(command)) {
    command = command || 'query';
  }

  return {
    command,
    prompt,
    rawPrompt,
    wiki: wikiResult.value,
    path: pathResult.value,
    domain: domainResult.value,
    fileRefs: extractFileRefs(prompt),
    urls: extractUrls(prompt),
    jiraKeys: extractJiraKeys(prompt)
  };
}

function inferCommand(prompt) {
  const lower = prompt.toLowerCase();
  if (hasIngestSignal(prompt, lower)) {
    return 'ingest';
  }
  return 'query';
}

function hasIngestSignal(prompt, lower) {
  if (lower.startsWith('ingest ') || lower.startsWith('add ') || lower.startsWith('import ')) {
    return true;
  }
  if (extractFileRefs(prompt).length > 0 || extractUrls(prompt).length > 0) {
    return true;
  }
  if (JIRA_KEY_PATTERN.test(prompt) && /\b(ingest|add|import|jira)\b/i.test(prompt)) {
    return true;
  }
  return /\bconfluence\b/i.test(prompt) && /\b(ingest|add|import|page)\b/i.test(prompt);
}

function extractKeyValue(text, key) {
  const pattern = new RegExp(`(^|\\s)${key}:(?:"([^"]+)"|'([^']+)'|([^\\s]+))`, 'i');
  const match = text.match(pattern);
  if (!match) {
    return { value: undefined, text };
  }
  const value = match[2] || match[3] || match[4] || '';
  const nextText = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, ' ').trim();
  return { value, text: nextText };
}

function extractFileRefs(text) {
  const refs = [];
  const pattern = /#file:("[^"]+"|'[^']+'|\S+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    refs.push(stripQuotes(match[1]));
  }
  return refs;
}

function extractUrls(text) {
  const urls = [];
  const pattern = /https?:\/\/[^\s<>)"']+/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    urls.push(match[0].replace(/[.,;:!?]+$/, ''));
  }
  return urls;
}

function extractJiraKeys(text) {
  const keys = [];
  const pattern = new RegExp(JIRA_KEY_PATTERN.source, 'g');
  let match;
  while ((match = pattern.exec(text)) !== null) {
    keys.push(match[0]);
  }
  return keys;
}

function stripQuotes(value) {
  if (!value) {
    return value;
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function firstQuotedOrToken(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return undefined;
  }
  const quoted = trimmed.match(/^"([^"]+)"|^'([^']+)'/);
  if (quoted) {
    return quoted[1] || quoted[2];
  }
  return trimmed.split(/\s+/)[0];
}

function removeFirstQuotedOrToken(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    return end === -1 ? '' : trimmed.slice(end + 1).trim();
  }
  if (trimmed.startsWith("'")) {
    const end = trimmed.indexOf("'", 1);
    return end === -1 ? '' : trimmed.slice(end + 1).trim();
  }
  return trimmed.split(/\s+/).slice(1).join(' ');
}

module.exports = {
  parseRequest,
  firstQuotedOrToken,
  removeFirstQuotedOrToken,
  extractUrls,
  extractFileRefs,
  extractJiraKeys,
  hasIngestSignal
};
