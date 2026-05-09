function progress(stream, message) {
  if (stream && typeof stream.progress === 'function') {
    stream.progress(message);
  }
}

function markdown(stream, message) {
  if (stream && typeof stream.markdown === 'function') {
    stream.markdown(message);
  }
}

function reference(stream, uriOrPath) {
  if (stream && typeof stream.reference === 'function') {
    try {
      stream.reference(uriOrPath);
    } catch (_error) {
      // References are helpful but non-critical; keep chat operations moving.
    }
  }
}

module.exports = {
  progress,
  markdown,
  reference
};
