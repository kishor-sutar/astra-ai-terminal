"use strict";

const c = {
  reset:   "\x1b[0m",  bold: "\x1b[1m",   dim:     "\x1b[2m",
  cyan:    "\x1b[36m", green: "\x1b[32m", yellow:  "\x1b[33m",
  red:     "\x1b[31m", magenta: "\x1b[35m", white: "\x1b[97m",
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

module.exports = { c, fmt, printBanner, printHelp, createSpinner };