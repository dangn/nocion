function stringifyFrontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data || {})) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((item) => JSON.stringify(String(item))).join(', ')}]`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (value !== undefined && value !== null) {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push('---');
  return `${lines.join('\n')}\n\n`;
}

function parseFrontmatter(markdown) {
  const text = String(markdown || '');
  if (!text.startsWith('---\n')) {
    return { data: {}, body: text };
  }
  const end = text.indexOf('\n---', 4);
  if (end === -1) {
    return { data: {}, body: text };
  }
  const raw = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\s*\n/, '');
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = match[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^"|"$/g, '');
    }
  }
  return { data, body };
}

function makePage({ title, type, sources = [], body }) {
  const updated = new Date().toISOString().slice(0, 10);
  return `${stringifyFrontmatter({ title, type, sources, updated })}# ${title}\n\n${String(body || '').trim()}\n`;
}

module.exports = {
  stringifyFrontmatter,
  parseFrontmatter,
  makePage
};
