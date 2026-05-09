const test = require('node:test');
const assert = require('assert');
const Module = require('module');

test('activate registers chat participant with image icon', () => {
  const originalLoad = Module._load;
  const subscriptions = [];
  const participant = {};
  const vscodeStub = {
    chat: {
      createChatParticipant(id, handler) {
        assert.equal(id, 'nocion.chat');
        assert.equal(typeof handler, 'function');
        return participant;
      }
    },
    Uri: {
      joinPath(base, ...segments) {
        return `${base}/${segments.join('/')}`;
      }
    }
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return vscodeStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('../src/extension')];
    const extension = require('../src/extension');
    extension.activate({ extensionUri: 'extension-root', subscriptions });
  } finally {
    Module._load = originalLoad;
  }

  assert.equal(participant.iconPath, 'extension-root/images/nocion-icon.svg');
  assert.equal(subscriptions[0], participant);
});
