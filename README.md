# ⚡ Astra-AI Terminal

> A High-Speed AI Terminal Agent that converts natural language into shell commands for Windows (PowerShell, CMD) and Linux/macOS (Bash, Git, Docker, K8s), with built-in MySQL mode, semantic caching, true RAG, and a live web dashboard.

```
   █████╗ ███████╗████████╗██████╗  █████╗
  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗
  ███████║███████╗   ██║   ██████╔╝███████║
  ██╔══██║╚════██║   ██║   ██╔══██╗██╔══██║
  ██║  ██║███████║   ██║   ██║  ██║██║  ██║
  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
  High-Speed AI Terminal Agent  v1.0.0
```

---

## Architecture

```
User Terminal (Natural Language)
        |
        v
Node.js CLI (agent.js) — readline REPL loop
        | HTTP POST /generate
        v
Python FastAPI Engine (port 7771)
        |
        +---> ChromaDB Semantic Cache
        |           | similarity >= 0.9  --> CACHE HIT (instant return)
        |           | similarity 0.75-0.89 --> LOW CONFIDENCE WARNING
        |           | similarity < 0.75  --> retrieve top 3 similar (RAG)
        |                                         |
        |                                         v
        |                               Gemini 2.0 Flash (LangChain)
        |                               (grounded in RAG context)
        |
        +---> MongoDB (command logs + analytics)
        |
        v
JSON Response --> CLI --> Y/N Confirmation --> Shell Execution
```

---

## Features

| Feature | Description |
|---|---|
| Natural Language → Shell Command | Gemini 2.0 Flash generates shell-appropriate commands |
| Semantic Cache | ChromaDB cosine similarity — hit ≥ 0.9 returns instantly |
| True RAG | Top 3 similar past commands injected into Gemini prompt |
| Shell Auto-Detection | PowerShell / CMD / Bash detected via environment variables |
| Multi-Turn Context | Last 3 commands sent as conversation history |
| MySQL Mode | Natural language → SQL queries with schema injection |
| Danger Detection | 14+ patterns — red warning, default flips to N |
| Confidence Warning | Yellow warning if similarity 0.75–0.89 |
| Web Dashboard | Live stats, cache hit ring, command log at `/dashboard` |
| `--explain` Flag | Plain English explanation before execution |
| Session Summary | Hit rate, tokens saved, dangerous blocked on `:exit` |
| MongoDB Logging | Every command persisted with full metadata |
| Self-Growing Cache | Knowledge base grows with every use |

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Model | Google Gemini 2.0 Flash |
| LLM Framework | LangChain (Python) |
| Backend | FastAPI (Python) |
| Vector DB | ChromaDB (cosine similarity) |
| Storage | MongoDB |
| CLI | Node.js (Pure JavaScript) |
| MySQL Client | mysql2 (Node.js) |
| Dashboard | HTML/CSS/JS (served by FastAPI) |

---

## Project Structure

```
astra-ai-terminal/
├── server/
│   ├── main.py          ← FastAPI entry point + lifespan
│   ├── config.py        ← All env variables
│   ├── models.py        ← Pydantic models
│   ├── prompts.py       ← Shell-aware system prompts
│   ├── cache.py         ← ChromaDB cache + RAG retrieval
│   ├── database.py      ← MongoDB logging
│   ├── llm.py           ← Gemini + LangChain
│   ├── routes.py        ← All API routes
│   ├── requirements.txt
│   ├── .env
│   └── static/
│       ├── dashboard.html
│       └── fevicon.png
│
├── cli/
│   ├── agent.js         ← REPL entry point
│   ├── package.json
│   └── lib/
│       ├── config.js    ← Constants
│       ├── display.js   ← Colors, banner, spinner
│       ├── shell.js     ← Shell detection, execution, MySQL
│       ├── http.js      ← All HTTP calls to backend
│       ├── safety.js    ← Danger patterns
│       └── stats.js     ← Session stats
│
├── start-windows.bat
├── README.md
└── package.json
```

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | ≥ 3.10 |
| Node.js | ≥ 18.0 |
| MongoDB | ≥ 6.0 |
| MySQL | ≥ 8.0 (optional) |
| Gemini API Key | [Get free key](https://aistudio.google.com/apikey) |

---

## Quick Start

### 1. Configure

```bash
cp server/.env.example server/.env
# Edit server/.env and add your GEMINI_API_KEY
```

### 2. Install dependencies

```bash
# Python
cd server
pip install -r requirements.txt

# Node.js
cd ../cli
npm install
```

### 3. Start the engine

```bash
# Terminal 1
cd server
python main.py
```

```
✅ LLM ready  (model=gemini-2.0-flash)
✅ ChromaDB ready  (path=./chroma_store, docs=0)
✅ MongoDB connected (uri=mongodb://localhost:27017)
✅ Astra-AI Engine ready!
```

### 4. Launch the CLI

```bash
# Terminal 2 — from any folder
astra-agent init
```

### 5. Windows one-command launcher

```cmd
start-windows.bat
```

---

## Global Install

```bash
cd cli
npm install -g . --force
```

Now `astra-agent init` works from any folder on your system.

---

## Usage

```
astra ❯ list all files including hidden
⚡ Cache hit  (similarity: 0.98)
  $ Get-ChildItem -Force

astra ❯ create file server.js
📚 RAG-assisted generation
  $ New-Item -Path "server.js" -ItemType File

astra ❯ delete all files recursively
  ⚠  DANGEROUS COMMAND DETECTED
  Run this DANGEROUS command? (y/N)

astra ❯ check git status --explain
  $ git status
  ┌─ What this does ──────────────────────
  │  Shows the current state of your working directory and staging area.
  └───────────────────────────────────────
```

---

## MySQL Mode

```
astra ❯ :mysql-config password
  Enter MySQL password: ****

astra ❯ :mysql
  ✓ MySQL mode activated

astra [mysql] ❯ show all databases
  $ SHOW DATABASES;
  +--------------------+
  | Database           |
  +--------------------+
  | mydb               |
  | student            |
  +--------------------+

astra [mysql] ❯ use mydb
  Switched to database: mydb

astra [mysql] ❯ find all users where age greater than 25
  $ SELECT * FROM users WHERE age > 25;

astra [mysql] ❯ :mysql
  MongoDB mode deactivated.
```

---

## Meta Commands

| Command | Description |
|---|---|
| `:help` | Show all commands |
| `:history` | Session command history |
| `:stats` | Cache statistics |
| `:clear` | Clear semantic cache |
| `:shell` | Show detected shell |
| `:mysql` | Toggle MySQL mode |
| `:mysql-config password` | Set MySQL password (hidden) |
| `:mysql-config user <val>` | Set MySQL user |
| `:mysql-config database <val>` | Set MySQL database |
| `:exit` | Exit with session summary |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Engine status |
| POST | `/generate` | Generate shell command |
| POST | `/explain` | Explain a command |
| POST | `/mongo/execute` | Execute MongoDB query |
| GET | `/history` | Command history |
| GET | `/cache/stats` | Cache statistics |
| DELETE | `/cache` | Clear cache |
| GET | `/dashboard` | Web dashboard |

---

## Environment Variables

```env
# Required
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash

# MongoDB
MONGO_URI=mongodb://localhost:27017

# ChromaDB
CHROMA_PATH=./chroma_store
SIMILARITY_THRESHOLD=0.9

# RAG
MAX_CONTEXT=3
MAX_RETRIEVAL=3

# MySQL (optional)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=

# Server
ASTRA_PORT=7771
```

---

## Response Types

| Label | Meaning |
|---|---|
| `⚡ Cache hit` | Returned from ChromaDB instantly — zero API cost |
| `📚 RAG-assisted` | Generated by Gemini using past command history as context |
| `🔮 Generated by Gemini` | Fresh generation — no prior context available |

---

## Dashboard

Open automatically on `astra-agent init` or visit:
```
http://127.0.0.1:7771/dashboard
```

Shows live stats, cache hit rate donut chart, command log with CACHE/RAG/LLM labels, and engine status. Auto-refreshes every 10 seconds.

---

## License

MIT © Astra-AI Terminal Contributors