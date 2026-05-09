const { createChatHandler } = require('./chat/participant');

function activate(context) {
  const vscode = require('vscode');
  const handler = createChatHandler({ vscode, context });
  const participant = vscode.chat.createChatParticipant('nocion.chat', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'nocion-icon.svg');
  context.subscriptions.push(participant);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
