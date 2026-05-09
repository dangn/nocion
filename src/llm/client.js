const { extractJson } = require('./json');

function createLlmClient(env = {}) {
  const vscode = env.vscode;

  async function complete(model, messages, token) {
    if (!model || typeof model.sendRequest !== 'function') {
      throw new Error('No language model is available. Select a Copilot model in VS Code Chat and try again.');
    }
    const crafted = messages.map((message) => toVscodeMessage(message));
    const response = await model.sendRequest(crafted, {}, token);
    let text = '';
    for await (const fragment of response.text) {
      text += fragment;
    }
    return text;
  }

  async function completeJson(model, messages, token) {
    const text = await complete(model, messages, token);
    return extractJson(text);
  }

  async function streamMarkdown(model, messages, stream, token) {
    if (!model || typeof model.sendRequest !== 'function') {
      throw new Error('No language model is available. Select a Copilot model in VS Code Chat and try again.');
    }
    const crafted = messages.map((message) => toVscodeMessage(message));
    const response = await model.sendRequest(crafted, {}, token);
    let text = '';
    for await (const fragment of response.text) {
      text += fragment;
      if (stream && typeof stream.markdown === 'function') {
        stream.markdown(fragment);
      }
    }
    return text;
  }

  function toVscodeMessage(message) {
    const role = message.role || 'user';
    const content = String(message.content || '');
    if (vscode && vscode.LanguageModelChatMessage) {
      if (role === 'assistant' && vscode.LanguageModelChatMessage.Assistant) {
        return vscode.LanguageModelChatMessage.Assistant(content);
      }
      if (vscode.LanguageModelChatMessage.User) {
        return vscode.LanguageModelChatMessage.User(content);
      }
    }
    return { role, content };
  }

  return {
    complete,
    completeJson,
    streamMarkdown
  };
}

module.exports = {
  createLlmClient
};
