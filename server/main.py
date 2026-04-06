# # """
# # Astra-AI Python Backend Server
# # FastAPI + LangChain + Gemini + ChromaDB + MongoDB
# # """

# # import os
# # import sys
# # import asyncio
# # import platform
# # import subprocess
# # import re
# # from datetime import datetime, timezone
# # from typing import Optional


# # import uvicorn
# # from fastapi import FastAPI, HTTPException
# # from fastapi.middleware.cors import CORSMiddleware
# # from pydantic import BaseModel
# # from dotenv import load_dotenv

# # load_dotenv()

# # # ── LangChain / Gemini ──────────────────────────────────────────────────────
# # from langchain_google_genai import ChatGoogleGenerativeAI
# # from langchain.prompts import ChatPromptTemplate
# # from langchain.schema.output_parser import StrOutputParser

# # # ── ChromaDB Vector Cache ────────────────────────────────────────────────────
# # import chromadb
# # from chromadb.utils import embedding_functions

# # # ── MongoDB ──────────────────────────────────────────────────────────────────
# # from pymongo import MongoClient
# # from pymongo.errors import ConnectionFailure

# # # ─────────────────────────────────────────────────────────────────────────────
# # # Configuration
# # # ─────────────────────────────────────────────────────────────────────────────
# # GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
# # GEMINI_MODEL     = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
# # MONGO_URI        = os.getenv("MONGO_URI", "mongodb://localhost:27017")
# # CHROMA_PATH      = os.getenv("CHROMA_PATH", "./chroma_store")
# # SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.9"))
# # PORT             = int(os.getenv("ASTRA_PORT", "7771"))
# # MAX_CONTEXT = int(os.getenv("MAX_CONTEXT", ""))

# # # ─────────────────────────────────────────────────────────────────────────────
# # # FastAPI App
# # # ─────────────────────────────────────────────────────────────────────────────
# # app = FastAPI(
# #     title="Astra-AI Engine",
# #     description="High-speed AI Terminal Agent backend",
# #     version="1.0.0",
# # )

# # app.add_middleware(
# #     CORSMiddleware,
# #     allow_origins=["*"],
# #     allow_methods=["*"],
# #     allow_headers=["*"],
# # )

# # # ─────────────────────────────────────────────────────────────────────────────
# # # Global clients (initialized on startup)
# # # ─────────────────────────────────────────────────────────────────────────────
# # llm_chain   = None
# # chroma_col  = None
# # mongo_db    = None

# # # ─────────────────────────────────────────────────────────────────────────────
# # # Pydantic Models
# # # ─────────────────────────────────────────────────────────────────────────────

# # class CommandResponse(BaseModel):
# #     command: str
# #     shell: str
# #     cache_hit: bool
# #     similarity: Optional[float] = None
# #     session_id: Optional[str] = None

# # class HealthResponse(BaseModel):
# #     status: str
# #     version: str
# #     components: dict

# # # ─────────────────────────────────────────────────────────────────────────────
# # # Shell-aware prompt
# # # ─────────────────────────────────────────────────────────────────────────────
# # SYSTEM_PROMPTS = {
# #     "powershell": """You are Astra-AI, an expert Windows PowerShell assistant.
# # The user will describe what they want to do in natural language.
# # Return ONLY the PowerShell command — no explanation, no markdown fences, no extra text.
# # Use PowerShell-native cmdlets (Get-ChildItem, Set-Location, etc.) where possible.
# # If multiple commands are needed, chain them with semicolons or use pipeline operators.""",

# #     "cmd": """You are Astra-AI, an expert Windows CMD (Command Prompt) assistant.
# # The user will describe what they want to do in natural language.
# # Return ONLY the CMD command — no explanation, no markdown fences, no extra text.
# # Use classic Windows CMD syntax. Avoid PowerShell syntax entirely.""",

# #     "bash": """You are Astra-AI, an expert Linux/macOS Bash assistant.
# # The user will describe what they want to do in natural language.
# # Return ONLY the bash command — no explanation, no markdown fences, no extra text.
# # Use standard Unix utilities. If multiple steps are needed, chain with && or use pipes.""",

# #     "git": """You are Astra-AI, an expert Git CLI assistant.
# # The user will describe what they want to do in natural language.
# # Return ONLY the git command(s) — no explanation, no markdown fences, no extra text.""",

# #     "docker": """You are Astra-AI, an expert Docker CLI assistant.
# # The user will describe what they want to do in natural language.
# # Return ONLY the docker command(s) — no explanation, no markdown fences, no extra text.""",

# #     "kubectl": """You are Astra-AI, an expert Kubernetes kubectl assistant.
# # The user will describe what they want to do in natural language.
# # Return ONLY the kubectl command(s) — no explanation, no markdown fences, no extra text.""",
# # }

# # def get_prompt(shell: str) -> ChatPromptTemplate:
# #     system = SYSTEM_PROMPTS.get(shell.lower(), SYSTEM_PROMPTS["bash"])
# #     return ChatPromptTemplate.from_messages([
# #         ("system", system),
# #         ("human", "{query}"),
# #     ])

# # # ─────────────────────────────────────────────────────────────────────────────
# # # Startup / Shutdown
# # # ─────────────────────────────────────────────────────────────────────────────
# # @app.on_event("startup")
# # async def startup():
# #     global llm_chain, chroma_col, mongo_db

# #     print("🚀 Astra-AI Engine starting up...")

# #     # ── LangChain + Gemini ───────────────────────────────────────────────────
# #     if not GEMINI_API_KEY:
# #         print("⚠️  GEMINI_API_KEY not set — LLM calls will fail")
    
# #     llm = ChatGoogleGenerativeAI(
# #         model=GEMINI_MODEL,
# #         google_api_key=GEMINI_API_KEY,
# #         temperature=0.1,
# #     )
# #     # We build chain per-request (shell-aware), but share the LLM instance
# #     app.state.llm = llm

# #     # ── ChromaDB ─────────────────────────────────────────────────────────────
# #     try:
# #         ef = embedding_functions.DefaultEmbeddingFunction()
# #         chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
# #         chroma_col = chroma_client.get_or_create_collection(
# #             name="astra_cache",
# #             embedding_function=ef,
# #             metadata={"hnsw:space": "cosine"},
# #         )
# #         print(f"✅ ChromaDB ready  (path={CHROMA_PATH}, docs={chroma_col.count()})")
# #     except Exception as e:
# #         print(f"⚠️  ChromaDB init failed: {e}")
# #         chroma_col = None

# #     # ── MongoDB ───────────────────────────────────────────────────────────────
# #     try:
# #         client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
# #         client.admin.command("ping")
# #         mongo_db = client["astra_ai"]
# #         print(f"✅ MongoDB connected (uri={MONGO_URI})")
# #     except ConnectionFailure as e:
# #         print(f"⚠️  MongoDB unavailable: {e} — logging disabled")
# #         mongo_db = None

# #     print("✅ Astra-AI Engine ready!\n")


# # @app.on_event("shutdown")
# # async def shutdown():
# #     print("👋 Astra-AI Engine shutting down...")

# # # ─────────────────────────────────────────────────────────────────────────────
# # # Helpers
# # # ─────────────────────────────────────────────────────────────────────────────
# # def _cache_key(query: str, shell: str) -> str:
# #     # Normalize filenames (with extensions)
# #     normalized = re.sub(r'\b[\w-]+\.\w+\b', '<file>', query.strip().lower())
# #     # Normalize standalone words at end of query (folder/variable names)
# #     normalized = re.sub(r'\b([a-z]{2,10})\s*$', '<name>', normalized.strip())
# #     normalized = re.sub(r'\s+', ' ', normalized).strip()
# #     return f"{shell}::{normalized}"


# # def _search_cache(query: str, shell: str):
# #     """Return (command, similarity) if cache hit, else (None, None)."""
# #     if chroma_col is None:
# #         return None, None
# #     try:
# #         results = chroma_col.query(
# #             query_texts=[_cache_key(query, shell)],
# #             n_results=1,
# #             include=["documents", "metadatas", "distances"],
# #         )
# #         if not results["ids"][0]:
# #             return None, None

# #         distance  = results["distances"][0][0]
# #         similarity = 1.0 - distance          # cosine distance → similarity
# #         if similarity >= SIMILARITY_THRESHOLD:
# #             command = results["metadatas"][0][0]["command"]
# #             return command, round(similarity, 4)
# #         return None, None
# #     except Exception as e:
# #         print(f"Cache search error: {e}")
# #         return None, None


# # def _store_cache(query: str, shell: str, command: str):
# #     """Upsert query→command into ChromaDB."""
# #     if chroma_col is None:
# #         return
# #     try:
# #         key = _cache_key(query, shell)
# #         chroma_col.upsert(
# #             ids=[key],
# #             documents=[key],
# #             metadatas=[{"command": command, "shell": shell, "query": query}],
# #         )
# #     except Exception as e:
# #         print(f"Cache store error: {e}")


# # def _log_mongo(query: str, shell: str, command: str,
# #                cache_hit: bool, session_id: Optional[str]):
# #     """Persist log entry to MongoDB asynchronously (best-effort)."""
# #     if mongo_db is None:
# #         return
# #     try:
# #         mongo_db.command_logs.insert_one({
# #             "query":      query,
# #             "shell":      shell,
# #             "command":    command,
# #             "cache_hit":  cache_hit,
# #             "session_id": session_id,
# #             "timestamp":  datetime.now(timezone.utc),
# #             "os":         platform.system(),
# #         })
# #     except Exception as e:
# #         print(f"Mongo log error: {e}")


# # async def _generate_command(query: str, shell: str, history: list = []) -> str:
# #     system = SYSTEM_PROMPTS.get(shell.lower(), SYSTEM_PROMPTS["bash"])
    
# #     messages = [("system", system)]
    
# #     # Inject last N command pairs as context
# #     for pair in history[-MAX_CONTEXT:]:
# #         messages.append(("human", pair["query"]))
# #         messages.append(("assistant", pair["command"]))
    
# #     messages.append(("human", query))
    
# #     prompt = ChatPromptTemplate.from_messages(messages)
# #     chain  = prompt | app.state.llm | StrOutputParser()
# #     result = await chain.ainvoke({})
# #     result = result.strip().strip("`").strip()
# #     for fence in ["```powershell", "```bash", "```cmd", "```shell", "```"]:
# #         result = result.replace(fence, "")
# #     return result.strip()

# # # ─────────────────────────────────────────────────────────────────────────────
# # # Routes
# # # ─────────────────────────────────────────────────────────────────────────────
# # @app.get("/health", response_model=HealthResponse)
# # async def health():
# #     return {
# #         "status": "ok",
# #         "version": "1.0.0",
# #         "components": {
# #             "llm":     "gemini-2.0-flash-lite",
# #             "cache":   "chromadb" if chroma_col is not None else "disabled",
# #             "storage": "mongodb"  if mongo_db is not None   else "disabled",
# #         },
# #     }


# # @app.post("/generate", response_model=CommandResponse)
# # async def generate(req: CommandRequest):
# #     if not req.query.strip():
# #         raise HTTPException(status_code=400, detail="Query cannot be empty")

# #     shell = req.shell.lower()

# #     # 1️⃣  Semantic cache lookup
# #     cached_cmd, similarity = _search_cache(req.query, shell)
# #     if cached_cmd:
# #         # Swap filenames (with extensions)
# #         new_files = re.findall(r'\b[\w-]+\.\w+\b', req.query)
# #         old_files = re.findall(r'\b[\w-]+\.\w+\b', cached_cmd)
# #         if new_files and old_files:
# #             for old_f, new_f in zip(old_files, new_files):
# #                 cached_cmd = cached_cmd.replace(old_f, new_f)

# #        # Swap only the target name (last word in query)
# #         query_tokens = req.query.strip().split()
# #         target_name  = query_tokens[-1] if query_tokens else None

# #         if target_name and not re.search(r'\.\w+$', target_name):
# #             # Find the value after -Path in the cached command
# #             path_match = re.search(r'-Path\s+"?(\w+)"?', cached_cmd)
# #             if path_match:
# #                 old_name = path_match.group(1)
# #                 cached_cmd = cached_cmd.replace(old_name, target_name, 1)
# #         _log_mongo(req.query, shell, cached_cmd, True, req.session_id)
# #         return CommandResponse(
# #             command=cached_cmd,
# #             shell=shell,
# #             cache_hit=True,
# #             similarity=similarity,
# #             session_id=req.session_id,
# #         )

# #     # 2️  LLM fallback
# #     try:
# #         command = await _generate_command(req.query, shell, req.history)
# #     except Exception as e:
# #         raise HTTPException(status_code=502, detail=f"LLM error: {e}")

# #     # 3️  Store result in cache + MongoDB
# #     _store_cache(req.query, shell, command)
# #     _log_mongo(req.query, shell, command, False, req.session_id)

# #     return CommandResponse(
# #         command=command,
# #         shell=shell,
# #         cache_hit=False,
# #         similarity=None,
# #         session_id=req.session_id,
# #     )


# # @app.get("/history")
# # async def get_history(session_id: Optional[str] = None, limit: int = 20):
# #     if mongo_db is None:
# #         return {"logs": [], "note": "MongoDB not connected"}
# #     query_filter = {}
# #     if session_id:
# #         query_filter["session_id"] = session_id
# #     logs = list(
# #         mongo_db.command_logs
# #         .find(query_filter, {"_id": 0})
# #         .sort("timestamp", -1)
# #         .limit(limit)
# #     )
# #     # Convert datetime to ISO string for JSON serialization
# #     for log in logs:
# #         if "timestamp" in log:
# #             log["timestamp"] = log["timestamp"].isoformat()
# #     return {"logs": logs}


# # @app.delete("/cache")
# # async def clear_cache():
# #     if chroma_col is None:
# #         return {"cleared": 0, "note": "Cache not available"}
# #     before = chroma_col.count()
# #     chroma_col.delete(where={"shell": {"$ne": "__impossible__"}})
# #     return {"cleared": before, "remaining": chroma_col.count()}


# # @app.get("/cache/stats")
# # async def cache_stats():
# #     if chroma_col is None:
# #         return {"count": 0, "status": "disabled"}
# #     return {
# #         "count":     chroma_col.count(),
# #         "threshold": SIMILARITY_THRESHOLD,
# #         "backend":   "chromadb",
# #         "path":      CHROMA_PATH,
# #     }


# # # ─────────────────────────────────────────────────────────────────────────────
# # # Entry point
# # # ─────────────────────────────────────────────────────────────────────────────
# # if __name__ == "__main__":
# #     uvicorn.run(
# #         "main:app",
# #         host="127.0.0.1",
# #         port=PORT,
# #         log_level="info",
# #         reload=False,
# #     )



# """
# Astra-AI Terminal — Python Backend Server
# FastAPI + LangChain + Gemini + ChromaDB + MongoDB
# """

# import os
# import re
# import platform
# from contextlib import asynccontextmanager
# from datetime import datetime, timezone
# from typing import Optional

# import uvicorn
# from fastapi import FastAPI, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import FileResponse
# from fastapi.staticfiles import StaticFiles
# from pydantic import BaseModel
# from dotenv import load_dotenv

# load_dotenv()

# from langchain_google_genai import ChatGoogleGenerativeAI
# from langchain.prompts import ChatPromptTemplate
# from langchain.schema.output_parser import StrOutputParser

# import chromadb
# from chromadb.utils import embedding_functions

# from pymongo import MongoClient
# from pymongo.errors import ConnectionFailure

# # ── Config ────────────────────────────────────────────────────────────────────
# GEMINI_API_KEY       = os.getenv("GEMINI_API_KEY", "")
# GEMINI_MODEL         = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
# MONGO_URI            = os.getenv("MONGO_URI", "mongodb://localhost:27017")
# CHROMA_PATH          = os.getenv("CHROMA_PATH", "./chroma_store")
# SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.9"))
# MAX_CONTEXT          = int(os.getenv("MAX_CONTEXT", "3"))
# PORT                 = int(os.getenv("ASTRA_PORT", "7771"))

# chroma_col = None
# mongo_db   = None

# # ── Lifespan ──────────────────────────────────────────────────────────────────
# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     global chroma_col, mongo_db

#     print("🚀 Astra-AI Engine starting up...")

#     if not GEMINI_API_KEY:
#         print("⚠️  GEMINI_API_KEY not set — LLM calls will fail")

#     app.state.llm = ChatGoogleGenerativeAI(
#         model=GEMINI_MODEL,
#         google_api_key=GEMINI_API_KEY,
#         temperature=0.1,
#     )
#     print(f"✅ LLM ready  (model={GEMINI_MODEL})")

#     try:
#         ef            = embedding_functions.DefaultEmbeddingFunction()
#         chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
#         chroma_col    = chroma_client.get_or_create_collection(
#             name="astra_cache",
#             embedding_function=ef,
#             metadata={"hnsw:space": "cosine"},
#         )
#         print(f"✅ ChromaDB ready  (path={CHROMA_PATH}, docs={chroma_col.count()})")
#     except Exception as e:
#         print(f"⚠️  ChromaDB init failed: {e}")
#         chroma_col = None

#     try:
#         client   = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
#         client.admin.command("ping")
#         mongo_db = client["astra_ai"]
#         print(f"✅ MongoDB connected (uri={MONGO_URI})")
#     except ConnectionFailure as e:
#         print(f"⚠️  MongoDB unavailable: {e} — logging disabled")
#         mongo_db = None

#     print("✅ Astra-AI Engine ready!\n")
#     yield
#     print("👋 Astra-AI Engine shutting down...")


# # ── App ───────────────────────────────────────────────────────────────────────
# app = FastAPI(
#     title="Astra-AI Engine",
#     description="High-speed AI Terminal Agent backend",
#     version="1.0.0",
#     lifespan=lifespan,
# )

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# app.mount("/static", StaticFiles(directory="static"), name="static")

# @app.get("/dashboard", include_in_schema=False)
# async def dashboard():
#     return FileResponse("static/dashboard.html")


# # ── Models ────────────────────────────────────────────────────────────────────
# class CommandRequest(BaseModel):
#     query:      str
#     shell:      str           = "bash"
#     session_id: Optional[str] = None
#     os_info:    Optional[str] = None
#     history:    list          = []

# class CommandResponse(BaseModel):
#     command:    str
#     shell:      str
#     cache_hit:  bool
#     similarity: Optional[float] = None
#     session_id: Optional[str]   = None

# class ExplainRequest(BaseModel):
#     command: str
#     shell:   str = "bash"

# class ExplainResponse(BaseModel):
#     explanation: str

# class HealthResponse(BaseModel):
#     status:     str
#     version:    str
#     components: dict


# # ── Shell prompts ─────────────────────────────────────────────────────────────
# SYSTEM_PROMPTS = {
#     "powershell": """You are Astra-AI, an expert Windows PowerShell assistant.
# The user will describe what they want to do in natural language.
# Return ONLY the PowerShell command — no explanation, no markdown fences, no extra text.
# Use PowerShell-native cmdlets (Get-ChildItem, Set-Location, etc.) where possible.
# If multiple commands are needed, chain them with semicolons or use pipeline operators.""",

#     "cmd": """You are Astra-AI, an expert Windows CMD (Command Prompt) assistant.
# The user will describe what they want to do in natural language.
# Return ONLY the CMD command — no explanation, no markdown fences, no extra text.
# Use classic Windows CMD syntax. Avoid PowerShell syntax entirely.""",

#     "bash": """You are Astra-AI, an expert Linux/macOS Bash assistant.
# The user will describe what they want to do in natural language.
# Return ONLY the bash command — no explanation, no markdown fences, no extra text.
# Use standard Unix utilities. If multiple steps are needed, chain with && or use pipes.""",

#     "git": """You are Astra-AI, an expert Git CLI assistant.
# The user will describe what they want to do in natural language.
# Return ONLY the git command(s) — no explanation, no markdown fences, no extra text.""",

#     "docker": """You are Astra-AI, an expert Docker CLI assistant.
# The user will describe what they want to do in natural language.
# Return ONLY the docker command(s) — no explanation, no markdown fences, no extra text.""",

#     "kubectl": """You are Astra-AI, an expert Kubernetes kubectl assistant.
# The user will describe what they want to do in natural language.
# Return ONLY the kubectl command(s) — no explanation, no markdown fences, no extra text.""",
# }


# # ── Cache key ─────────────────────────────────────────────────────────────────
# def _cache_key(query: str, shell: str) -> str:
#     normalized = re.sub(r'\.[\w-]+|[\w-]+\.\w+', '<file>', query.strip().lower())
#     normalized = re.sub(r'\s+', ' ', normalized).strip()
#     return f"{shell}::{normalized}"


# # ── Filename substitution ─────────────────────────────────────────────────────
# def _substitute_filenames(query: str, cached_cmd: str) -> str:
#     pattern   = r'\.[\w-]+|[\w-]+\.\w+'
#     new_files = re.findall(pattern, query)
#     old_files = re.findall(pattern, cached_cmd)
#     if new_files and old_files:
#         for old_f, new_f in zip(old_files, new_files):
#             cached_cmd = cached_cmd.replace(old_f, new_f, 1)
#     return cached_cmd


# # ── Cache helpers ─────────────────────────────────────────────────────────────
# def _search_cache(query: str, shell: str):
#     if chroma_col is None:
#         return None, None
#     try:
#         results = chroma_col.query(
#             query_texts=[_cache_key(query, shell)],
#             n_results=1,
#             include=["documents", "metadatas", "distances"],
#         )
#         if not results["ids"][0]:
#             return None, None
#         similarity = 1.0 - results["distances"][0][0]
#         if similarity >= SIMILARITY_THRESHOLD:
#             command = results["metadatas"][0][0]["command"]
#             return command, round(similarity, 4)
#         return None, round(similarity, 4)
#     except Exception as e:
#         print(f"Cache search error: {e}")
#         return None, None


# def _store_cache(query: str, shell: str, command: str):
#     if chroma_col is None:
#         return
#     try:
#         key = _cache_key(query, shell)
#         chroma_col.upsert(
#             ids=[key],
#             documents=[key],
#             metadatas=[{"command": command, "shell": shell, "query": query}],
#         )
#     except Exception as e:
#         print(f"Cache store error: {e}")


# def _log_mongo(query: str, shell: str, command: str,
#                cache_hit: bool, session_id: Optional[str]):
#     if mongo_db is None:
#         return
#     try:
#         mongo_db.command_logs.insert_one({
#             "query":      query,
#             "shell":      shell,
#             "command":    command,
#             "cache_hit":  cache_hit,
#             "session_id": session_id,
#             "timestamp":  datetime.now(timezone.utc),
#             "os":         platform.system(),
#         })
#     except Exception as e:
#         print(f"Mongo log error: {e}")


# async def _generate_command(query: str, shell: str, history: list = []) -> str:
#     system = SYSTEM_PROMPTS.get(shell.lower(), SYSTEM_PROMPTS["bash"])

#     messages = [("system", system)]

#     # Inject last MAX_CONTEXT command pairs as context (only on cache miss)
#     for pair in history[-MAX_CONTEXT:]:
#         messages.append(("human",      pair.get("query",   "")))
#         messages.append(("assistant",  pair.get("command", "")))

#     messages.append(("human", query))

#     prompt = ChatPromptTemplate.from_messages(messages)
#     chain  = prompt | app.state.llm | StrOutputParser()
#     result = await chain.ainvoke({})
#     result = result.strip().strip("`").strip()
#     for fence in ["```powershell", "```bash", "```cmd", "```shell", "```"]:
#         result = result.replace(fence, "")
#     return result.strip()


# # ── Routes ────────────────────────────────────────────────────────────────────
# @app.get("/health", response_model=HealthResponse)
# async def health():
#     return {
#         "status":  "ok",
#         "version": "1.0.0",
#         "components": {
#             "llm":     GEMINI_MODEL,
#             "cache":   "chromadb" if chroma_col is not None else "disabled",
#             "storage": "mongodb"  if mongo_db   is not None else "disabled",
#         },
#     }


# @app.post("/generate", response_model=CommandResponse)
# async def generate(req: CommandRequest):
#     if not req.query.strip():
#         raise HTTPException(status_code=400, detail="Query cannot be empty")

#     shell = req.shell.lower()

# # 1️⃣  Semantic cache lookup
#     cached_cmd, similarity = _search_cache(req.query, shell)
#     best_similarity = similarity  # keep score even on miss for confidence warning

#     if cached_cmd:
#         cached_cmd = _substitute_filenames(req.query, cached_cmd)
#         _log_mongo(req.query, shell, cached_cmd, True, req.session_id)
#         return CommandResponse(
#             command=cached_cmd,
#             shell=shell,
#             cache_hit=True,
#             similarity=similarity,
#             session_id=req.session_id,
#         )

#     # 2️⃣  LLM fallback with multi-turn context
#     try:
#         command = await _generate_command(req.query, shell, req.history)
#     except Exception as e:
#         raise HTTPException(status_code=502, detail=f"LLM error: {e}")

#     # 3️⃣  Store in cache + MongoDB
#     _store_cache(req.query, shell, command)
#     _log_mongo(req.query, shell, command, False, req.session_id)

#     return CommandResponse(
#         command=command,
#         shell=shell,
#         cache_hit=False,
#         similarity=best_similarity,
#         session_id=req.session_id,
#     )


# @app.post("/explain", response_model=ExplainResponse)
# async def explain(req: ExplainRequest):
#     prompt = ChatPromptTemplate.from_messages([
#         ("system", "You are a shell command explainer. Given a shell command, explain in ONE plain English sentence what it does. No technical jargon. Be concise."),
#         ("human",  "Command: {command}"),
#     ])
#     chain = prompt | app.state.llm | StrOutputParser()
#     try:
#         result = await chain.ainvoke({"command": req.command})
#         return ExplainResponse(explanation=result.strip())
#     except Exception as e:
#         raise HTTPException(status_code=502, detail=f"LLM error: {e}")


# @app.get("/history")
# async def get_history(session_id: Optional[str] = None, limit: int = 20):
#     if mongo_db is None:
#         return {"logs": [], "note": "MongoDB not connected"}
#     query_filter = {}
#     if session_id:
#         query_filter["session_id"] = session_id
#     logs = list(
#         mongo_db.command_logs
#         .find(query_filter, {"_id": 0})
#         .sort("timestamp", -1)
#         .limit(limit)
#     )
#     for log in logs:
#         if "timestamp" in log:
#             log["timestamp"] = log["timestamp"].isoformat()
#     return {"logs": logs}


# @app.delete("/cache")
# async def clear_cache():
#     if chroma_col is None:
#         return {"cleared": 0, "note": "Cache not available"}
#     before = chroma_col.count()
#     chroma_col.delete(where={"shell": {"$ne": "__impossible__"}})
#     return {"cleared": before, "remaining": chroma_col.count()}


# @app.get("/cache/stats")
# async def cache_stats():
#     if chroma_col is None:
#         return {"count": 0, "status": "disabled"}
#     return {
#         "count":     chroma_col.count(),
#         "threshold": SIMILARITY_THRESHOLD,
#         "backend":   "chromadb",
#         "path":      CHROMA_PATH,
#         "model":     GEMINI_MODEL,
#     }


# if __name__ == "__main__":
#     uvicorn.run(
#         "main:app",
#         host="127.0.0.1",
#         port=PORT,
#         log_level="info",
#         reload=False,
#     )



"""
Astra-AI Terminal — Entry Point
"""
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import PORT
from cache import init_cache
from database import init_database
from llm import init_llm
from routes import router

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Astra-AI Engine starting up...")
    app.state.llm = init_llm()
    init_cache()
    init_database()
    print("✅ Astra-AI Engine ready!\n")
    yield
    print("👋 Astra-AI Engine shutting down...")

app = FastAPI(
    title="Astra-AI Engine",
    description="High-speed AI Terminal Agent backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=PORT,
                log_level="info", reload=False)