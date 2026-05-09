function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('Model returned an empty response.');
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1]);
    }
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last > first) {
      return JSON.parse(raw.slice(first, last + 1));
    }
    throw new Error('Model response did not contain valid JSON.');
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  extractJson,
  ensureArray
};
