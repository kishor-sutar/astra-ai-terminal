"use strict";

const DANGER_PATTERNS = [
  /rm\s+-rf/i,
  /Remove-Item.*-Force/i,
  /Remove-Item.*-Recurse/i,
  /\|\s*Remove-Item/i,
  /format\s+[a-z]:/i,
  /del\s+\/[sf]/i,
  /rd\s+\/s/i,
  /rmdir\s+\/s/i,
  /drop\s+database/i,
  /drop\s+table/i,
  /git\s+push.*--force/i,
  />\s*\/dev\/sd/i,
  /mkfs/i,
  /-Recurse.*-File.*\|\s*Remove/i,
];

function isDangerous(command) {
  return DANGER_PATTERNS.some(p => p.test(command));
}

module.exports = { isDangerous };