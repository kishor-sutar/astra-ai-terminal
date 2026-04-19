#!/usr/bin/env node
"use strict";

const readline = require("readline");
const os       = require("os");

const { SERVER_URL, SIMILARITY_THRESHOLD } = require("./lib/config");
const { c, fmt, printBanner, printHelp, createSpinner } = require("./lib/display");
const { detectShell, executeCommand,executeMySQLCommand  }  = require("./lib/shell");
const { pingServer, generateCommand, fetchHistory,
        clearCache, fetchCacheStats, explainCommand,
        executeMongoQuery, fetchMySQLSchema } = require("./lib/http");
const { isDangerous }    = require("./lib/safety");
const { trackCommand, trackDangerous, getSummary } = require("./lib/stats");

function generateSessionId() {
  return `astra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function askConfirm(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (ans) => resolve(ans.trim().toLowerCase()));
  });
}

async function init() {
  printBanner();

  const shell       = detectShell();
  const sessionId   = generateSessionId();
  const sessionHistory = [];

  const mysqlMode = { active: false };
  const mysqlConfig = {
    host:     "localhost",
    port:     3306,
    user:     "root",
    password: "",
    database: "",
  };

  console.log(`  ${fmt.dim("Shell detected:")} ${fmt.success(shell.toUpperCase())}`);
  console.log(`  ${fmt.dim("Session:")}        ${fmt.dim(sessionId)}`);
  console.log(`  ${fmt.dim("Server:")}         ${fmt.dim(SERVER_URL)}`);
  console.log(`  ${fmt.dim("Dashboard:")}      ${fmt.success(SERVER_URL + "/dashboard")}\n`);
  // Auto-open dashboard in browser
  const { exec } = require("child_process");
  const dashUrl = `${SERVER_URL}/dashboard`;
  if (process.platform === "win32") {
    exec(`start ${dashUrl}`);
  } else if (process.platform === "darwin") {
    exec(`open ${dashUrl}`);
  } else {
    exec(`xdg-open ${dashUrl}`);
  }

  const spinner0 = createSpinner("Connecting to Astra-AI engine...");
  const alive    = await pingServer();
  if (alive) {
    spinner0.stop(`  ${fmt.success("✓")} Engine online — ready to assist!\n`);
  } else {
    spinner0.stop(
      `  ${fmt.error("✗ Cannot reach the Astra-AI engine.")}\n` +
      `  ${fmt.dim("Make sure the Python server is running:")}\n` +
      `  ${fmt.cmd("cd server && python main.py")}\n`
    );
  }

  console.log(fmt.dim("  Type a task in plain English, or :help for commands.\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  rl.on("close", () => {
    const { total, cacheHits, llmCalls, dangerous, hitRate, tokensSaved } = getSummary();
    console.log(`\n  ${fmt.primary("Session Summary")}`);
    console.log(`  ${fmt.dim("─────────────────────────────────────")}`);
    console.log(`  ${fmt.dim("Commands run:     ")}${fmt.success(total)}`);
    console.log(`  ${fmt.dim("Cache hits:       ")}${fmt.success(cacheHits)}  ${fmt.dim(`(${hitRate}%)`)}`);
    console.log(`  ${fmt.dim("LLM calls:        ")}${fmt.success(llmCalls)}`);
    console.log(`  ${fmt.dim("Tokens saved:     ")}${fmt.success("~" + tokensSaved)}`);
    console.log(`  ${fmt.dim("Dangerous blocked:")}${fmt.success(dangerous)}`);
    console.log(`  ${fmt.dim("─────────────────────────────────────")}`);
    console.log(`\n${fmt.dim("  Goodbye! Session ended.")}\n`);
    process.exit(0);
  });

  const prompt = () => {
    const cwd = process.cwd();
    const promptLabel = mysqlMode.active
      ? `${c.gray}${cwd}${c.reset}\n${c.cyan}${c.bold}  astra${c.reset}${c.yellow} [mysql]${c.reset}${c.gray} ❯${c.reset} `
      : `${c.gray}${cwd}${c.reset}\n${c.cyan}${c.bold}  astra${c.reset}${c.gray} ❯${c.reset} `;
    rl.question(promptLabel, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      if (trimmed === ":exit" || trimmed === ":quit" || trimmed === ":q") { rl.close(); return; }
      if (trimmed === ":help")  { printHelp(); prompt(); return; }

      if (trimmed === ":shell") {
        console.log(`\n  ${fmt.dim("Detected shell:")} ${fmt.success(shell.toUpperCase())}\n`);
        prompt(); return;
      }

      if (trimmed === ":mysql") {
        mysqlMode.active = !mysqlMode.active;
        if (mysqlMode.active) {
          console.log(`\n  ${fmt.success("✓ MySQL mode activated")}`);
          console.log(`  ${fmt.dim("Type SQL tasks in plain English.")}`);
          console.log(`  ${fmt.dim("Type :mysql again to exit MySQL mode.\n")}`);
        } else {
          console.log(`\n  ${fmt.dim("MySQL mode deactivated.\n")}`);
        }
        prompt(); return;
      }

      if (trimmed.startsWith(":mysql-config")) {
        const parts = trimmed.split(" ");
        if (parts[1] === "password") {
          // Ask for password securely with hidden input
          rl.stdoutMuted = true;
          rl.question(`  ${fmt.warn("Enter MySQL password: ")}`, (pwd) => {
            rl.stdoutMuted = false;
            process.stdout.write("\n");
            mysqlConfig.password = pwd;
            console.log(`\n  ${fmt.success("✓ MySQL password updated.")}\n`);
            prompt();
          });
          // Mute stdout during input
          const originalWrite = rl.output.write.bind(rl.output);
          rl.output.write = (s) => {
            if (rl.stdoutMuted && s !== "\r\n" && s !== "\n") return;
            originalWrite(s);
          };
          return;
        }
        if (parts[1] === "user")     mysqlConfig.user     = parts[2];
        if (parts[1] === "database") mysqlConfig.database = parts[2];
        if (parts[1] === "host")     mysqlConfig.host     = parts[2];
        console.log(`\n  ${fmt.success(`✓ MySQL ${parts[1]} updated.`)} ${fmt.dim(`(${parts[2]})`)}\n`);
        prompt(); return;
      }

      if (trimmed === ":stats") {
        const sp = createSpinner("Fetching cache stats...");
        try {
          const stats = await fetchCacheStats();
          sp.stop();
          console.log(`\n  ${fmt.primary("Cache Statistics")}`);
          console.log(`  ${fmt.dim("────────────────────────────")}`);
          console.log(`  ${fmt.dim("Entries:")}    ${fmt.success(stats.count)}`);
          console.log(`  ${fmt.dim("Threshold:")}  ${fmt.success(stats.threshold)}`);
          console.log(`  ${fmt.dim("Backend:")}    ${fmt.success(stats.backend || "chromadb")}\n`);
        } catch { sp.stop(`  ${fmt.error("✗ Could not reach server.")}`); }
        prompt(); return;
      }

      if (trimmed === ":clear") {
        const ans = await askConfirm(rl, `  ${fmt.warn("⚠  Clear all cached entries? (y/N) ")}`);
        if (ans === "y" || ans === "yes") {
          const sp = createSpinner("Clearing cache...");
          try {
            const res = await clearCache();
            sp.stop(`  ${fmt.success(`✓ Cleared ${res.cleared} entries.`)}\n`);
          } catch { sp.stop(`  ${fmt.error("✗ Failed to clear cache.")}`); }
        } else { console.log(`  ${fmt.dim("Aborted.")}\n`); }
        prompt(); return;
      }

      if (trimmed === ":history") {
        const sp = createSpinner("Fetching session history...");
        try {
          const res  = await fetchHistory(sessionId, 10);
          const logs = res.logs || [];
          sp.stop();
          if (logs.length === 0) {
            console.log(`\n  ${fmt.dim("No commands logged yet.")}\n`);
          } else {
            console.log(`\n  ${fmt.primary("Session History")}`);
            console.log(`  ${fmt.dim("────────────────────────────────────────────")}`);
            logs.forEach((log, idx) => {
              const hit = log.cache_hit ? fmt.success("[cache]") : fmt.dim("[llm]  ");
              console.log(`  ${fmt.dim(`${idx + 1}.`)} ${hit} ${fmt.cmd(log.command)}`);
              console.log(`       ${fmt.dim(log.query)}\n`);
            });
          }
        } catch { sp.stop(`  ${fmt.error("✗ Could not fetch history.")}`); }
        prompt(); return;
      }

      const explainMode = trimmed.endsWith("--explain");
      const query       = explainMode ? trimmed.replace("--explain", "").trim() : trimmed;
      // Override shell to mysql if in mysql mode
      const activeShell = mysqlMode.active ? "mysql" : mongoMode.active ? "mongodb" : shell;
      // Use stricter threshold for MySQL to avoid wrong cache hits
      
      const spinner = createSpinner("Thinking...");
      let result;
      try {
        let finalQuery = query;
        if (mysqlMode.active && mysqlConfig.database) {
          const schema = await fetchMySQLSchema(mysqlConfig);
          if (schema) {
            finalQuery = `Database: ${mysqlConfig.database}\nSchema:\n${schema}\n\nTask: ${query}`;
          }
        }
        result = await generateCommand(
          finalQuery, activeShell,
          mysqlMode.active ? null : sessionId,
          mysqlMode.active ? [] : sessionHistory
        );
        spinner.stop();
      } catch (err) {
        spinner.stop(
          `\n  ${fmt.error("✗ Engine error:")} ${fmt.dim(err.message)}\n` +
          `  ${fmt.dim("Is the Python server running?")}\n`
        );
        prompt(); return;
      }

      const { command, cache_hit, similarity } = result;

      trackCommand(cache_hit);

      if (!cache_hit && similarity && similarity >= 0.75 && similarity < SIMILARITY_THRESHOLD) {
        console.log(`\n  ${fmt.warn(`⚠  Low confidence match (similarity: ${similarity}) — sending to AI to verify`)}`);
      }

      const cacheLabel = cache_hit
        ? fmt.success(`  ⚡ Cache hit  (similarity: ${similarity})`)
        : result.rag_assisted
          ? fmt.highlight("  📚 RAG-assisted generation")
          : fmt.dim("  🔮 Generated by Gemini");

      console.log(`\n${cacheLabel}`);
      console.log(`\n${fmt.primary("  Suggested command:")}`);
      console.log(fmt.cmd(command));

      if (explainMode) {
        const exSpinner = createSpinner("Explaining...");
        try {
          const exRes = await explainCommand(command, shell);
          exSpinner.stop();
          console.log(`  ${fmt.dim("┌─ What this does ───────────────────────────")}`);
          console.log(`  ${fmt.warn("│")}  ${exRes.explanation}`);
          console.log(`  ${fmt.dim("└────────────────────────────────────────────")}\n`);
        } catch { exSpinner.stop(`  ${fmt.dim("(Could not fetch explanation)")}\n`); }
      }
      console.log();

      const danger = isDangerous(command);
      if (danger) {
        trackDangerous();
        console.log(`\n  ${c.red}${c.bold}  ⚠  DANGEROUS COMMAND DETECTED${c.reset}`);
        console.log(`  ${c.red}  This command can cause irreversible damage.${c.reset}`);
        console.log(`  ${c.red}  Double-check before proceeding.${c.reset}\n`);
      }

      const ans = await askConfirm(rl,
        danger
          ? `  ${c.red}${c.bold}Run this DANGEROUS command? (y/N) ${c.reset}`
          : `  ${fmt.warn("Run this command? (Y/n) ")}`);

      if (danger ? (ans === "y" || ans === "yes") : (ans === "" || ans === "y" || ans === "yes")) {
        console.log(`\n  ${fmt.dim("─── Output ─────────────────────────────────")}\n`);

        if (mysqlMode.active) {
          // Execute via mysql2
          // Auto-update database if USE statement detected
          const useMatch = command.match(/^USE\s+(\w+)/i);
          if (useMatch) {
            mysqlConfig.database = useMatch[1];
            console.log(`  ${fmt.dim(`Switched to database: ${useMatch[1]}`)}\n`);
          }
          const result = await executeMySQLCommand(command, mysqlConfig);
          if (result.success) {
            if (Array.isArray(result.rows) && result.rows.length > 0) {
              // Print table headers
              const headers = Object.keys(result.rows[0]);
              // Calculate column widths
              const colWidths = headers.map(h => {
                const maxDataLen = result.rows.reduce((max, row) => {
                  return Math.max(max, String(row[h] ?? "NULL").length);
                }, 0);
                return Math.max(h.length, maxDataLen);
              });

              const separator = "+-" + colWidths.map(w => "-".repeat(w)).join("-+-") + "-+";
              const headerRow = "| " + headers.map((h, i) => h.padEnd(colWidths[i])).join(" | ") + " |";

              console.log("  " + separator);
              console.log("  " + headerRow);
              console.log("  " + separator);
              result.rows.forEach(row => {
                const dataRow = "| " + headers.map((h, i) => String(row[h] ?? "NULL").padEnd(colWidths[i])).join(" | ") + " |";
                console.log("  " + dataRow);
              });
              console.log("  " + separator);
              console.log(`  ${fmt.dim(`${result.rows.length} row(s) in set`)}`);
            } else {
              console.log(`  ${fmt.success("✓ Query executed successfully.")}`);
            }
            console.log(`\n  ${fmt.dim("────────────────────────────────────────────")}`);
            console.log(`  ${fmt.success("✓ MySQL query completed.")}\n`);
            sessionHistory.push({ query: trimmed, command });
          } else {
            console.log(`  ${fmt.error(`✗ MySQL error: ${result.error}`)}\n`);
            console.log(`\n  ${fmt.dim("────────────────────────────────────────────")}`);
          }
        } else {
          // Normal shell execution
          const exitCode = await executeCommand(command, shell);
          console.log(`\n  ${fmt.dim("────────────────────────────────────────────")}`);
          if (exitCode === 0) {
            console.log(`  ${fmt.success("✓ Command completed successfully.")}\n`);
            sessionHistory.push({ query: trimmed, command });
          } else {
            console.log(`  ${fmt.warn(`⚠  Command exited with code ${exitCode}.`)}\n`);
          }
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

const [,, subcommand] = process.argv;

if (!subcommand || subcommand === "init") {
  init().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
} else if (subcommand === "version" || subcommand === "-v" || subcommand === "--version") {
  console.log("Astra-AI v1.0.0");
} else if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
  console.log(`
Astra-AI — High-Speed AI Terminal Agent

Usage:
  astra-agent init     Start the interactive AI shell
  astra-agent version  Print version
  astra-agent help     Show this help
`);
} else {
  console.error(`Unknown command: ${subcommand}`);
  process.exit(1);
}