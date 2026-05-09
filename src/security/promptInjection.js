const INJECTION_PATTERNS = [
  /\bignore (all )?(previous|prior|above) instructions\b/i,
  /\bsystem prompt\b/i,
  /\bdeveloper message\b/i,
  /\byou are now\b/i,
  /\bforget (the|your) instructions\b/i,
  /\breveal (the )?(prompt|instructions|secrets)\b/i,
  /\bBEGIN (SYSTEM|DEVELOPER|ASSISTANT) MESSAGE\b/i,
  /\bEND (SYSTEM|DEVELOPER|ASSISTANT) MESSAGE\b/i
];

function scanPromptInjection(content) {
  const text = String(content || '');
  const matches = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.source);
    }
  }
  return {
    detected: matches.length > 0,
    matches
  };
}

function neutralizePromptInjection(content) {
  let text = String(content || '');
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, (match) => match.split('').join('\u200B'));
  }
  return text;
}

module.exports = {
  scanPromptInjection,
  neutralizePromptInjection
};
