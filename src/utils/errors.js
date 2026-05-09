class UserCancelledError extends Error {
  constructor(message = 'Operation cancelled.') {
    super(message);
    this.name = 'UserCancelledError';
    this.userCancelled = true;
  }
}

class NocionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'NocionError';
    this.code = code;
  }
}

function formatError(error) {
  if (!error) {
    return 'Unknown error.';
  }
  if (error.userCancelled) {
    return error.message || 'Operation cancelled.';
  }
  if (error.message) {
    return redactSecrets(error.message);
  }
  return redactSecrets(String(error));
}

function redactSecrets(value) {
  return String(value)
    .replace(/Authorization:\s*Basic\s+[A-Za-z0-9+/=._-]+/gi, 'Authorization: [REDACTED]')
    .replace(/Basic\s+[A-Za-z0-9+/=._-]{16,}/gi, 'Basic [REDACTED]')
    .replace(/api[_-]?token["'\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi, 'api_token=[REDACTED]')
    .replace(/token["'\s:=]+[A-Za-z0-9._~+/=-]{12,}/gi, 'token=[REDACTED]');
}

module.exports = {
  UserCancelledError,
  NocionError,
  formatError,
  redactSecrets
};
