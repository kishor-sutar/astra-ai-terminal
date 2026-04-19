"use strict";
const os = require("os");
const { SERVER_URL } = require("./config");

async function fetchJson(url, options = {}) {
  if (typeof fetch !== "undefined") {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }
  try {
    const axios = require("axios");
    const res = await axios({ url, ...options,
      data: options.body ? JSON.parse(options.body) : undefined });
    return res.data;
  } catch (axiosErr) {
    if (axiosErr.code !== "MODULE_NOT_FOUND") throw axiosErr;
  }
  return new Promise((resolve, reject) => {
    const https = require(url.startsWith("https") ? "https" : "http");
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname, port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET", headers: options.headers || {},
    };
    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Non-JSON response: ${data}`)); }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function pingServer() {
  try {
    const data = await fetchJson(`${SERVER_URL}/health`, { method: "GET" });
    return data.status === "ok";
  } catch { return false; }
}

async function generateCommand(query, shell, sessionId, history) {
  return fetchJson(`${SERVER_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, shell, session_id: sessionId,
      os_info: os.platform(), history: history.slice(-3) }),
  });
}

async function fetchHistory(sessionId, limit = 10) {
  return fetchJson(`${SERVER_URL}/history?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`, { method: "GET" });
}

async function clearCache() {
  return fetchJson(`${SERVER_URL}/cache`, { method: "DELETE" });
}

async function fetchCacheStats() {
  return fetchJson(`${SERVER_URL}/cache/stats`, { method: "GET" });
}

async function explainCommand(command, shell) {
  return fetchJson(`${SERVER_URL}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, shell }),
  });
}

async function fetchMySQLSchema(mysqlConfig) {
  try {
    const mysql = require("mysql2/promise");
    const connection = await mysql.createConnection({
      host:     mysqlConfig.host     || "localhost",
      port:     mysqlConfig.port     || 3306,
      user:     mysqlConfig.user     || "root",
      password: mysqlConfig.password || "",
      database: mysqlConfig.database || undefined,
    });
    if (!mysqlConfig.database) { await connection.end(); return ""; }
    const [rows] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [mysqlConfig.database]
    );
    await connection.end();

    // Group by table
    const schema = {};
    rows.forEach(r => {
      if (!schema[r.TABLE_NAME]) schema[r.TABLE_NAME] = [];
      schema[r.TABLE_NAME].push(`${r.COLUMN_NAME}(${r.DATA_TYPE})`);
    });

    return Object.entries(schema)
      .map(([table, cols]) => `${table}: ${cols.join(", ")}`)
      .join("\n");
  } catch { return ""; }
}

module.exports = { fetchJson, pingServer, generateCommand,
                   fetchHistory, clearCache, fetchCacheStats,
                   explainCommand, fetchMySQLSchema };