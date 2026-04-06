"use strict";

const sessionStats = {
  total:     0,
  cacheHits: 0,
  llmCalls:  0,
  dangerous: 0,
};

function trackCommand(cacheHit) {
  sessionStats.total++;
  if (cacheHit) sessionStats.cacheHits++;
  else sessionStats.llmCalls++;
}

function trackDangerous() {
  sessionStats.dangerous++;
}

function getSummary() {
  const hitRate    = sessionStats.total > 0
    ? Math.round((sessionStats.cacheHits / sessionStats.total) * 100) : 0;
  const tokensSaved = sessionStats.cacheHits * 300;
  return { ...sessionStats, hitRate, tokensSaved };
}

module.exports = { trackCommand, trackDangerous, getSummary };