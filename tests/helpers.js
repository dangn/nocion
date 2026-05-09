const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const assert = require('assert');

async function tempWorkspace(name = 'nocion-test') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  const registryPath = path.join(root, '.nocion-registry');
  return { root, registryPath };
}

function createStream() {
  const chunks = [];
  const progress = [];
  return {
    chunks,
    progressMessages: progress,
    markdown(value) {
      chunks.push(String(value));
    },
    progress(value) {
      progress.push(String(value));
    },
    text() {
      return chunks.join('');
    }
  };
}

function createModel(responses) {
  const queue = [...responses];
  const calls = [];
  return {
    calls,
    async sendRequest(messages) {
      calls.push(messages);
      const response = queue.length ? queue.shift() : '';
      return {
        text: asyncIterable(String(response))
      };
    }
  };
}

async function* asyncIterable(text) {
  yield text;
}

function assertNoSecret(text, secret = 'super-secret-token') {
  assert.equal(String(text).includes(secret), false, 'secret leaked into output');
  assert.equal(/Authorization:\s*Basic/i.test(String(text)), false, 'Authorization header leaked into output');
}

module.exports = {
  tempWorkspace,
  createStream,
  createModel,
  assertNoSecret
};
