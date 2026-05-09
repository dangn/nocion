const { scanPromptInjection, neutralizePromptInjection } = require('./promptInjection');

function wrapUntrustedContent(content, label = 'DOCUMENT') {
  const scan = scanPromptInjection(content);
  const safeContent = scan.detected ? neutralizePromptInjection(content) : String(content || '');
  const warning = scan.detected
    ? `Prompt-injection-like patterns were detected and neutralized in ${label}.`
    : undefined;
  return {
    content: [
      `BEGIN UNTRUSTED ${label} CONTENT`,
      safeContent,
      `END UNTRUSTED ${label} CONTENT`
    ].join('\n'),
    warning,
    scan
  };
}

module.exports = {
  wrapUntrustedContent
};
