"use strict";
const os    = require("os");
const { spawn } = require("child_process");
const { fmt } = require("./display");

function detectShell() {
  const platform = os.platform();
  if (platform === "win32") {
    const psModule = process.env.PSModulePath || "";
    const comspec  = (process.env.COMSPEC || "").toLowerCase();
    if (psModule.length > 0) return "powershell";
    if (comspec.includes("cmd.exe")) return "cmd";
    return "powershell";
  }
  const shell = (process.env.SHELL || "/bin/bash").toLowerCase();
  if (shell.includes("zsh"))  return "bash";
  if (shell.includes("fish")) return "bash";
  return "bash";
}

function executeCommand(command, shell) {
  return new Promise((resolve) => {
    const platform = os.platform();
    let proc;
    if (platform === "win32") {
      proc = shell === "powershell"
        ? spawn("powershell.exe", ["-NoProfile", "-Command", command], { stdio: ["inherit","inherit","inherit"], shell: false })
        : spawn("cmd.exe", ["/c", command], { stdio: ["inherit","inherit","inherit"], shell: false });
    } else {
      proc = spawn("/bin/sh", ["-c", command], { stdio: ["inherit","inherit","inherit"], shell: false });
    }
    proc.on("close", resolve);
    proc.on("error", (err) => {
      console.error(fmt.error(`\n  ✗ Execution error: ${err.message}`));
      resolve(1);
    });
  });
}

// Executes a MySQL query using mysql2 and returns the results or error message
async function executeMySQLCommand(query, mysqlConfig) {
  const mysql = require("mysql2/promise");
  let connection;
  try {
    connection = await mysql.createConnection({
      host:     mysqlConfig.host     || "localhost",
      port:     mysqlConfig.port     || 3306,
      user:     mysqlConfig.user     || "root",
      password: mysqlConfig.password || "",
      database: mysqlConfig.database || undefined,
    });
    const [rows] = await connection.query(query);
    return { success: true, rows };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (connection) await connection.end();
  }
}


module.exports = { detectShell, executeCommand, executeMySQLCommand };