"use strict";
const os   = require("os");
const path = require("path");
const fs   = require("fs");

const CONFIG_PATH  = path.join(os.homedir(), ".astra-ai", "config.json");
const DEFAULT_PORT = 7771;

const SERVER_URL = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return cfg.serverUrl || `http://127.0.0.1:${DEFAULT_PORT}`;
  } catch {
    return `http://127.0.0.1:${DEFAULT_PORT}`;
  }
})();

const SIMILARITY_THRESHOLD = 0.9;

module.exports = { SERVER_URL, SIMILARITY_THRESHOLD };