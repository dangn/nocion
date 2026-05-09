function createSessionState() {
  let activeWikiPath;
  return {
    getActiveWikiPath() {
      return activeWikiPath;
    },
    setActiveWikiPath(nextPath) {
      activeWikiPath = nextPath;
    },
    clearActiveWikiPath() {
      activeWikiPath = undefined;
    }
  };
}

module.exports = {
  createSessionState
};
