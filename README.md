# ⚡ Astra-AI — High-Speed AI Terminal Agent

> A local-server AI agent that translates natural language into shell commands for Windows (CMD, PowerShell) and Linux/macOS (Bash, Git, Docker, K8s).

```
   █████╗ ███████╗████████╗██████╗  █████╗
  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗
  ███████║███████╗   ██║   ██████╔╝███████║
  ██╔══██║╚════██║   ██║   ██╔══██╗██╔══██║
  ██║  ██║███████║   ██║   ██║  ██║██║  ██║
  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER TERMINAL                        │
│                                                         │
│   $ astra-agent init                                    │
│   astra ❯ list all running docker containers            │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP POST /generate
                  ▼
┌─────────────────────────────────────────────────────────┐
│           PYTHON FASTAPI ENGINE  (port 7771)            │
│                                                         │
│  ┌──────────────┐    hit     ┌───────────────────────┐  │
│  │   ChromaDB   │ ─────────► │   Return cached cmd   │  │
│  │ Semantic     │            └───────────────────────┘  │
│  │ Cache        │                                        │
│  │ (FAISS-like) │    miss                               │
│  └──────┬───────┘ ─────────► ┌───────────────────────┐  │
│         │                    │  Gemini 2.0 Flash Lite │  │
│         │                    │  (via LangChain)       │  │
│         │                    └──────────┬────────────┘  │
│         │                               │               │
│         └───────────────────────────────┘               │
│                        │ store result                   │
│                        ▼                                │
│                 ┌──────────────┐                        │
│                 │   MongoDB    │  (command logs)        │
│                 └──────────────┘                        │
└─────────────────────────────────────────────────────────┘
                  │ JSON response
                  ▼
┌─────────────────────────────────────────────────────────┐
│           NODE.JS CLI  (agent.js)                       │
│                                                         │
│  ✓ Shell detected: BASH                                 │
│                                                         │
│  Suggested command:                                     │
│    $ docker ps                                          │
│                                                         │
│  Run this command? (Y/n) _                              │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool      | Version   | Required for        |
|-----------|-----------|---------------------|
| Python    | ≥ 3.10    | Backend engine      |
| Node.js   | ≥ 18.0    | CLI client          |
| MongoDB   | ≥ 6.0     | Command logging     |
| Gemini API Key | —   | AI generation       |

---

## Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/yourname/astra-ai.git
cd astra-ai

# Set up Python environment
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
# Terminal 1 — Python server
cd server
python main.py
```

```
INFO:     Started server process
INFO:     Waiting for application startup.
✅ ChromaDB ready  (path=./chroma_store, docs=0)
✅ MongoDB connected (uri=mongodb://localhost:27017)
✅ Astra-AI Engine ready!
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:7771
```

### 4. Launch the CLI

```bash
# Terminal 2 — Node.js CLI
cd cli
node agent.js init
```

### 5. One-command launcher (Linux/macOS)

```bash
chmod +x start.sh
./start.sh
```

### 6. One-command launcher (Windows)

```cmd
start-windows.bat
```

---

## Usage

```
  astra ❯ list all docker containers including stopped ones
  
  ⚡ Cache hit  (similarity: 0.9341)
  
  Suggested command:
    $ docker ps -a
  
  Run this command? (Y/n) y
  
  ─── Output ─────────────────────────────────
  CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS
  ────────────────────────────────────────────
  ✓ Command completed successfully.
```

### CLI Meta-Commands

| Command    | Description                          |
|------------|--------------------------------------|
| `:help`    | Show help                            |
| `:history` | Show this session's command history  |
| `:stats`   | Show semantic cache statistics       |
| `:clear`   | Clear all cached entries             |
| `:shell`   | Show detected shell type             |
| `:exit`    | Quit Astra-AI                        |

---

## Shell Support

| Shell        | Platform       | Auto-detected via                   |
|--------------|----------------|-------------------------------------|
| `powershell` | Windows        | `PSModulePath` env var              |
| `cmd`        | Windows        | `COMSPEC` env var                   |
| `bash`       | Linux / macOS  | `SHELL` env var                     |
| `git`        | All            | Specify in query: "git: ..."        |
| `docker`     | All            | Specify in query: "docker: ..."     |
| `kubectl`    | All            | Specify in query: "kubectl: ..."    |

---

## Configuration

### `server/.env`

| Variable               | Default                      | Description                          |
|------------------------|------------------------------|--------------------------------------|
| `GEMINI_API_KEY`       | *(required)*                 | Google AI Studio key                 |
| `MONGO_URI`            | `mongodb://localhost:27017`  | MongoDB connection string            |
| `CHROMA_PATH`          | `./chroma_store`             | ChromaDB persistence path            |
| `SIMILARITY_THRESHOLD` | `0.9`                        | Cache hit threshold (0.0 – 1.0)      |
| `ASTRA_PORT`           | `7771`                       | FastAPI server port                  |

---

## REST API

The Python engine exposes these endpoints:

| Method | Path            | Description                   |
|--------|-----------------|-------------------------------|
| GET    | `/health`       | Health check + component list |
| POST   | `/generate`     | Generate shell command        |
| GET    | `/history`      | Fetch command history         |
| GET    | `/cache/stats`  | Semantic cache statistics     |
| DELETE | `/cache`        | Clear cache                   |

### POST `/generate`

```json
{
  "query":      "list all running processes sorted by memory",
  "shell":      "bash",
  "session_id": "astra_1234_abc",
  "os_info":    "linux"
}
```

**Response:**

```json
{
  "command":    "ps aux --sort=-%mem",
  "shell":      "bash",
  "cache_hit":  false,
  "similarity": null,
  "session_id": "astra_1234_abc"
}
```

---

## Semantic Cache Deep Dive

```
User query: "show me disk usage"
          │
          ▼
   ChromaDB.query()
   similarity = 0.94  ──── ≥ 0.9 ──── CACHE HIT → return "df -h"
          │
          ▼ (if < 0.9)
   Gemini 2.0 Flash Lite
          │
          ▼
   ChromaDB.upsert()   ← Store for future hits
   MongoDB.insert()    ← Log for analytics
          │
          ▼
   Return command
```

The cache uses **cosine similarity** over sentence embeddings. The threshold `0.9` means queries must be ≥ 90% semantically similar to trigger a cache hit, making it robust to paraphrase variations while staying accurate.

---

## Global CLI Install

```bash
chmod +x setup.sh && ./setup.sh

# Now available globally:
astra-agent init
astra-agent start-server
astra-agent version
astra-agent help
```

---

## MongoDB Schema

```javascript
// Collection: command_logs
{
  _id:        ObjectId,
  query:      "list files in current directory",
  shell:      "bash",
  command:    "ls -la",
  cache_hit:  false,
  session_id: "astra_1234_abc",
  timestamp:  ISODate("2025-01-01T12:00:00Z"),
  os:         "Linux"
}
```

---

## Project Structure

```
astra-ai/
├── server/
│   ├── main.py               ← FastAPI + LangChain + ChromaDB + MongoDB
│   ├── requirements.txt      ← Python dependencies
│   └── .env.example          ← Environment variable template
│
├── cli/
│   ├── agent.js              ← Node.js interactive CLI client
│   └── package.json          ← npm metadata + bin entry
│
├── start.sh                  ← Linux/macOS one-command launcher
├── start-windows.bat         ← Windows one-command launcher
├── setup.sh                  ← Global npm link installer
├── package.json              ← Root monorepo package.json
└── README.md
```

---

## License

MIT © Astra-AI Contributors
