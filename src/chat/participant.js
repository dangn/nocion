const { createRouter } = require('./router');
const { formatError } = require('../utils/errors');

function createChatHandler(env) {
  const router = createRouter(env);
  return async function handleNocionChatRequest(request, chatContext, stream, token) {
    try {
      return await router.handle(request, chatContext, stream, token);
    } catch (error) {
      const message = formatError(error);
      if (stream && typeof stream.markdown === 'function') {
        stream.markdown(`Nocion could not complete the request.\n\n${message}\n`);
      }
      return {
        metadata: {
          command: request && request.command ? request.command : 'unknown',
          error: true
        }
      };
    }
  };
}

module.exports = {
  createChatHandler
};
