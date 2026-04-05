#!/usr/bin/env node
/**
 * Astra-AI CLI — Node.js Client
 * Pure JavaScript (no TypeScript).
 * Run: astra-agent init
 */

"use strict";

const readline  = require("readline");
const { exec, spawn } = require("child_process");
const os        = require("os");
const path      = require("path");
const fs        = require("fs");

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG_PATH   = path.join(os.homedir(), ".astra-ai", "config.json");
const DEFAULT_PORT  = 7771;
const SERVER_URL    = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return cfg.serverUrl || `http://127.0.0.1:${DEFAULT_PORT}`;
  } catch {
    return `http://127.0.0.1:${DEFAULT_PORT}`;
  }
})();

// ── ANSI Colors ───────────────────────────────────────────────────────────────
const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  cyan:    "\x1b[36m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  red:     "\x1b[31m",
  magenta: "\x1b[35m",
  blue:    "\x1b[34m",
  white:   "\x1b[97m",
  gray:    "\x1b[90m",
};

const fmt = {
  primary:   (s) => `${c.cyan}${c.bold}${s}${c.reset}`,
  success:   (s) => `${c.green}${s}${c.reset}`,
  warn:      (s) => `${c.yellow}${s}${c.reset}`,
  error:     (s) => `${c.red}${c.bold}${s}${c.reset}`,
  dim:       (s) => `${c.gray}${s}${c.reset}`,
  highlight: (s) => `${c.magenta}${c.bold}${s}${c.reset}`,
  cmd:       (s) => `${c.white}${c.bold}  $ ${s}${c.reset}`,
};

// ── Shell Detection ───────────────────────────────────────────────────────────
function detectShell() {
  const platform = os.platform();

  if (platform === "win32") {
    // Check parent process name via COMSPEC / PSModulePath
    const psModule = process.env.PSModulePath || "";
    const comspec  = (process.env.COMSPEC || "").toLowerCase();

    if (psModule.length > 0) return "powershell";
    if (comspec.includes("cmd.exe")) return "cmd";
    return "powershell"; // Default Windows
  }

  // Linux / macOS — check SHELL env or default to bash
  const shell = (process.env.SHELL || "/bin/bash").toLowerCase();
  if (shell.includes("zsh"))  return "bash"; // treat zsh as bash-compatible
  if (shell.includes("fish")) return "bash";
  return "bash";
}

// ── Session ID ────────────────────────────────────────────────────────────────
function generateSessionId() {
  return `astra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const sessionStats = {
  total:     0,
  cacheHits: 0,
  llmCalls:  0,
  dangerous: 0,
};
const sessionHistory = [];

// ── HTTP helpers (using built-in fetch / fallback to https module) ─────────────
async function fetchJson(url, options = {}) {
  // Node 18+ has built-in fetch; older Node uses https
  if (typeof fetch !== "undefined") {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }

  // Fallback: try axios if installed, else raw https
  try {
    const axios = require("axios");
    const res = await axios({ url, ...options,
      data: options.body ? JSON.parse(options.body) : undefined });
    return res.data;
  } catch (axiosErr) {
    if (axiosErr.code !== "MODULE_NOT_FOUND") throw axiosErr;
  }

  // Raw https fallback
  return new Promise((resolve, reject) => {
    const https = require(url.startsWith("https") ? "https" : "http");
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port,
      path:     parsedUrl.pathname + parsedUrl.search,
      method:   options.method || "GET",
      headers:  options.headers || {},
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
  } catch {
    return false;
  }
}

async function generateCommand(query, shell, sessionId) {
  return fetchJson(`${SERVER_URL}/generate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ 
      query, 
      shell, 
      session_id: sessionId, 
      os_info: os.platform(),
      history: sessionHistory.slice(-3),
    }),
  });
}

async function fetchHistory(sessionId, limit = 10) {
  const url = `${SERVER_URL}/history?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`;
  return fetchJson(url, { method: "GET" });
}

async function clearCache() {
  return fetchJson(`${SERVER_URL}/cache`, { method: "DELETE" });
}

async function cacheStats() {
  return fetchJson(`${SERVER_URL}/cache/stats`, { method: "GET" });
}

// ── Command Execution ─────────────────────────────────────────────────────────
function executeCommand(command, shell) {
  return new Promise((resolve) => {
    const platform = os.platform();
    let proc;

    if (platform === "win32") {
      if (shell === "powershell") {
        proc = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
          stdio: ["inherit", "inherit", "inherit"],
          shell: false,
        });
      } else {
        proc = spawn("cmd.exe", ["/c", command], {
          stdio: ["inherit", "inherit", "inherit"],
          shell: false,
        });
      }
    } else {
      proc = spawn("/bin/sh", ["-c", command], {
        stdio: ["inherit", "inherit", "inherit"],
        shell: false,
      });
    }

    proc.on("close", (code) => {
      resolve(code);
    });

    proc.on("error", (err) => {
      console.error(fmt.error(`\n  ✗ Execution error: ${err.message}`));
      resolve(1);
    });
  });
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function printBanner() {
  console.clear();
  console.log(`
${c.cyan}${c.bold}
   █████╗ ███████╗████████╗██████╗  █████╗
  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗
  ███████║███████╗   ██║   ██████╔╝███████║
  ██╔══██║╚════██║   ██║   ██╔══██╗██╔══██║
  ██║  ██║███████║   ██║   ██║  ██║██║  ██║
  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝${c.reset}
${c.gray}  ─────────────────────────────────────────
  High-Speed AI Terminal Agent  v1.0.0
  ─────────────────────────────────────────${c.reset}
`);
}

function printHelp() {
  console.log(`
${fmt.primary("  Available Commands:")}
  ${fmt.dim("─────────────────────────────────────────────")}
  ${fmt.highlight(":help")}      ${fmt.dim("Show this help message")}
  ${fmt.highlight(":history")}   ${fmt.dim("Show recent command history for this session")}
  ${fmt.highlight(":stats")}     ${fmt.dim("Show cache statistics")}
  ${fmt.highlight(":clear")}     ${fmt.dim("Clear the semantic cache")}
  ${fmt.highlight(":shell")}     ${fmt.dim("Show detected shell")}
  ${fmt.highlight(":exit")}      ${fmt.dim("Exit Astra-AI")}
  ${fmt.dim("─────────────────────────────────────────────")}
  ${fmt.dim("Or just type what you want to do in plain English.")}
`);
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function createSpinner(text) {
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${c.cyan}  ${frames[i++ % frames.length]}${c.reset}  ${c.gray}${text}${c.reset}   `);
  }, 80);
  return {
    stop: (msg = "") => {
      clearInterval(timer);
      process.stdout.write(`\r${" ".repeat(60)}\r`);
      if (msg) console.log(msg);
    },
  };
}

// ── Prompt for Y/N ────────────────────────────────────────────────────────────
function askConfirm(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      resolve(ans.trim().toLowerCase());
    });
  });
}

// ── Main Interactive Loop ─────────────────────────────────────────────────────
async function init() {
  printBanner();

  const shell     = detectShell();
  const sessionId = generateSessionId();

  console.log(`  ${fmt.dim("Shell detected:")} ${fmt.success(shell.toUpperCase())}`);
  console.log(`  ${fmt.dim("Session:")}        ${fmt.dim(sessionId)}`);
  console.log(`  ${fmt.dim("Server:")}         ${fmt.dim(SERVER_URL)}\n`);

  // Ping server
  const spinner0 = createSpinner("Connecting to Astra-AI engine...");
  const alive = await pingServer();
  if (alive) {
    spinner0.stop(`  ${fmt.success("✓")} Engine online — ready to assist!\n`);
  } else {
    spinner0.stop(
      `  ${fmt.error("✗ Cannot reach the Astra-AI engine.")}
  ${fmt.dim("Make sure the Python server is running:")}
  ${fmt.cmd("cd server && python main.py")}\n`
    );
    // Still allow meta-commands; just warn on AI queries
  }

  console.log(fmt.dim("  Type a task in plain English, or :help for commands.\n"));

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Graceful exit
  rl.on("close", () => {
    const hitRate = sessionStats.total > 0
      ? Math.round((sessionStats.cacheHits / sessionStats.total) * 100)
      : 0;
    const tokensSaved = sessionStats.cacheHits * 300;

    console.log(`\n  ${fmt.primary("Session Summary")}`);
    console.log(`  ${fmt.dim("─────────────────────────────────────")}`);
    console.log(`  ${fmt.dim("Commands run:     ")}${fmt.success(sessionStats.total)}`);
    console.log(`  ${fmt.dim("Cache hits:       ")}${fmt.success(sessionStats.cacheHits)}  ${fmt.dim(`(${hitRate}%)`)}`);
    console.log(`  ${fmt.dim("LLM calls:        ")}${fmt.success(sessionStats.llmCalls)}`);
    console.log(`  ${fmt.dim("Tokens saved:     ")}${fmt.success("~" + tokensSaved)}`);
    console.log(`  ${fmt.dim("Dangerous blocked:")}${fmt.success(sessionStats.dangerous)}`);
    console.log(`  ${fmt.dim("─────────────────────────────────────")}`);
    console.log(`\n${fmt.dim("  Goodbye! Session ended.")}\n`);
    process.exit(0);
  });

  // ── REPL ──────────────────────────────────────────────────────────────────
  const prompt = () => {
    const cwd = process.cwd();
    rl.question(`${c.gray}${cwd}${c.reset}\n${c.cyan}${c.bold}  astra${c.reset}${c.gray} ❯${c.reset} `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) { prompt(); return; }

      // ── Meta commands ──────────────────────────────────────────────────────
      if (trimmed === ":exit" || trimmed === ":quit" || trimmed === ":q") {
        rl.close();
        return;
      }

      if (trimmed === ":help") {
        printHelp();
        prompt();
        return;
      }

      if (trimmed === ":shell") {
        console.log(`\n  ${fmt.dim("Detected shell:")} ${fmt.success(shell.toUpperCase())}\n`);
        prompt();
        return;
      }

      if (trimmed === ":stats") {
        const sp = createSpinner("Fetching cache stats...");
        try {
          const stats = await cacheStats();
          sp.stop();
          console.log(`
  ${fmt.primary("Cache Statistics")}
  ${fmt.dim("────────────────────────────")}
  ${fmt.dim("Entries:")}    ${fmt.success(stats.count)}
  ${fmt.dim("Threshold:")}  ${fmt.success(stats.threshold)}
  ${fmt.dim("Backend:")}    ${fmt.success(stats.backend || "chromadb")}
  ${fmt.dim("Status:")}     ${fmt.success(stats.status || "active")}
`);
        } catch (e) {
          sp.stop(`  ${fmt.error("✗ Could not reach server.")}`);
        }
        prompt();
        return;
      }

      if (trimmed === ":clear") {
        const ans = await askConfirm(rl,
          `  ${fmt.warn("⚠  Clear all cached entries? (y/N) ")}`);
        if (ans === "y" || ans === "yes") {
          const sp = createSpinner("Clearing cache...");
          try {
            const res = await clearCache();
            sp.stop(`  ${fmt.success(`✓ Cleared ${res.cleared} entries.`)}\n`);
          } catch {
            sp.stop(`  ${fmt.error("✗ Failed to clear cache.")}`);
          }
        } else {
          console.log(`  ${fmt.dim("Aborted.")}\n`);
        }
        prompt();
        return;
      }

      if (trimmed === ":history") {
        const sp = createSpinner("Fetching session history...");
        try {
          const res = await fetchHistory(sessionId, 10);
          sp.stop();
          const logs = res.logs || [];
          if (logs.length === 0) {
            console.log(`\n  ${fmt.dim("No commands logged yet for this session.")}\n`);
          } else {
            console.log(`\n  ${fmt.primary("Session History")}`);
            console.log(`  ${fmt.dim("────────────────────────────────────────────")}`);
            logs.forEach((log, idx) => {
              const hit = log.cache_hit ? fmt.success("[cache]") : fmt.dim("[llm]  ");
              console.log(`  ${fmt.dim(`${idx + 1}.`)} ${hit} ${fmt.cmd(log.command)}`);
              console.log(`       ${fmt.dim(log.query)}\n`);
            });
          }
        } catch {
          sp.stop(`  ${fmt.error("✗ Could not fetch history.")}`);
        }
        prompt();
        return;
      }

      // ── AI Query ───────────────────────────────────────────────────────────
      const spinner = createSpinner("Thinking...");
      let result;
      try {
        result = await generateCommand(trimmed, shell, sessionId);
        spinner.stop();
      } catch (err) {
        spinner.stop(
          `\n  ${fmt.error("✗ Engine error:")} ${fmt.dim(err.message)}\n` +
          `  ${fmt.dim("Is the Python server running?")}\n`
        );
        prompt();
        return;
      }

      const { command, cache_hit, similarity } = result;

      // Track stats
      sessionStats.total++;
      if (cache_hit) sessionStats.cacheHits++;
      else sessionStats.llmCalls++;

      const cacheLabel = cache_hit
        ? fmt.success(`  ⚡ Cache hit  (similarity: ${similarity})`)
        : fmt.dim("  🔮 Generated by Gemini");

      console.log(`\n${cacheLabel}`);
      console.log(`\n${fmt.primary("  Suggested command:")}`);
      console.log(fmt.cmd(command));
      console.log();

      // Danger detection
      const dangerPatterns = [
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
      const isDangerous = dangerPatterns.some(p => p.test(command));
      if (isDangerous) sessionStats.dangerous++;
      if (isDangerous) {
        console.log(`\n  ${c.red}${c.bold}  ⚠  DANGEROUS COMMAND DETECTED${c.reset}`);
        console.log(`  ${c.red}  This command can cause irreversible damage.${c.reset}`);
        console.log(`  ${c.red}  Double-check before proceeding.${c.reset}\n`);
      }

      // Confirm execution
      const ans = await askConfirm(rl,
        isDangerous
          ? `  ${c.red}${c.bold}Run this DANGEROUS command? (y/N) ${c.reset}`
          : `  ${fmt.warn("Run this command? (Y/n) ")}`);

      if (isDangerous ? (ans === "y" || ans === "yes") : (ans === "" || ans === "y" || ans === "yes")) {
        // // ── Pre-execution file existence check ──────────────────────────────
        // const fs = require("fs");
        // const path = require("path");
        // const fileMatch = command.match(/\b[\w-]+\.\w+\b/);
        // if (fileMatch) {
        //   const targetFile = fileMatch[0];
        //   const fullPath = path.join(process.cwd(), targetFile);
        //   if (!fs.existsSync(fullPath)) {
        //     // File doesn't exist — find similar files
        //     const files = fs.readdirSync(process.cwd());
        //     const similar = files.filter(f => {
        //       const ext = path.extname(targetFile);
        //       const base = path.basename(targetFile, ext);
        //       return f.endsWith(ext) && f !== targetFile &&
        //         (f.includes(base) || base.includes(path.basename(f, ext)));
        //     });

        //     console.log(`\n  ${fmt.warn(`⚠  File "${targetFile}" does not exist in current directory.`)}`);
        //     if (similar.length > 0) {
        //       console.log(`  ${fmt.dim("Did you mean:")} ${similar.map(f => fmt.highlight(f)).join(", ")}`);
        //       const suggestion = await askConfirm(rl,
        //         `  ${fmt.warn(`Use "${similar[0]}" instead? (Y/n) `)}`);
        //       if (suggestion === "" || suggestion === "y" || suggestion === "yes") {
        //         command = command.replace(targetFile, similar[0]);
        //         console.log(`  ${fmt.success(`✓ Using "${similar[0]}" instead.`)}\n`);
        //       } else {
        //         console.log(`  ${fmt.dim("Proceeding with original command anyway...\n")}`);
        //       }
        //     } else {
        //       console.log(`  ${fmt.dim("No similar files found in current directory.")}`);
        //       const proceed = await askConfirm(rl,
        //         `  ${fmt.warn("Proceed anyway? (y/N) ")}`);
        //       if (proceed !== "y" && proceed !== "yes") {
        //         console.log(`  ${fmt.dim("Aborted.\n")}`);
        //         prompt();
        //         return;
        //       }
        //     }
        //     console.log();
        //   }
        // }



        console.log(`\n  ${fmt.dim("─── Output ─────────────────────────────────")}\n`);
        const exitCode = await executeCommand(command, shell);
        console.log(`\n  ${fmt.dim("────────────────────────────────────────────")}`);
       if (exitCode === 0) {
          console.log(`  ${fmt.success("✓ Command completed successfully.")}\n`);
          sessionHistory.push({ query: trimmed, command });
        } else {
          console.log(`  ${fmt.warn(`⚠  Command exited with code ${exitCode}.`)}\n`);
        }
      } else {
        console.log(`  ${fmt.dim("Skipped.\n")}`);
        sessionHistory.push({ query: trimmed, command });
      }

      prompt();
    });
  };

  prompt();
}

// ── Entry Point ───────────────────────────────────────────────────────────────
const [,, subcommand, ...args] = process.argv;

if (!subcommand || subcommand === "init") {
  init().catch((err) => {
    console.error(fmt.error(`Fatal: ${err.message}`));
    process.exit(1);
  });
} else if (subcommand === "start-server") {
  // Convenience: start the Python server from the CLI
  const serverDir = path.join(__dirname, "..", "server");
  console.log(fmt.primary("\n  Starting Astra-AI Python engine...\n"));
  const proc = spawn("python", ["main.py"], {
    cwd:   serverDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  proc.on("error", (e) => {
    console.error(fmt.error(`  ✗ Could not start server: ${e.message}`));
    console.log(fmt.dim("  Make sure Python is installed and server/requirements.txt is installed."));
  });
} else if (subcommand === "version" || subcommand === "-v" || subcommand === "--version") {
  console.log("Astra-AI v1.0.0");
} else if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
  console.log(`
${fmt.primary("Astra-AI — High-Speed AI Terminal Agent")}

${fmt.dim("Usage:")}
  astra-agent init           Start the interactive AI shell
  astra-agent start-server   Launch the Python engine (dev mode)
  astra-agent version        Print version
  astra-agent help           Show this help
`);
} else {
  console.error(fmt.error(`  Unknown command: ${subcommand}`));
  console.log(fmt.dim("  Run: astra-agent help"));
  process.exit(1);
}
