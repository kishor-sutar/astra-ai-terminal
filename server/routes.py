from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from models import (CommandRequest, CommandResponse,
                    ExplainRequest, ExplainResponse, HealthResponse)
from cache import (search_cache, store_cache, substitute_filenames,
                   clear_cache as _clear_cache, cache_stats as _cache_stats,
                   get_chroma_col)
from database import log_command, get_history as _get_history, get_mongo_db
from llm import generate_command, explain_command
from config import GEMINI_MODEL

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
async def health():
    chroma_col = get_chroma_col()
    mongo_db   = get_mongo_db()
    return {
        "status":  "ok",
        "version": "1.0.0",
        "components": {
            "llm":     GEMINI_MODEL,
            "cache":   "chromadb" if chroma_col is not None else "disabled",
            "storage": "mongodb"  if mongo_db   is not None else "disabled",
        },
    }

@router.post("/generate", response_model=CommandResponse)
async def generate(req: CommandRequest, request=None):
    from main import app
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    shell = req.shell.lower()

    cached_cmd, similarity = search_cache(req.query, shell)
    best_similarity = similarity

    if cached_cmd:
        cached_cmd = substitute_filenames(req.query, cached_cmd)
        log_command(req.query, shell, cached_cmd, True, req.session_id)
        return CommandResponse(
            command=cached_cmd, shell=shell,
            cache_hit=True, similarity=similarity,
            session_id=req.session_id,
        )

    try:
        from main import app
        command = await generate_command(app.state.llm, req.query, shell, req.history)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    store_cache(req.query, shell, command)
    log_command(req.query, shell, command, False, req.session_id)

    return CommandResponse(
        command=command, shell=shell,
        cache_hit=False, similarity=best_similarity,
        session_id=req.session_id,
    )

@router.post("/explain", response_model=ExplainResponse)
async def explain(req: ExplainRequest):
    try:
        from main import app
        result = await explain_command(app.state.llm, req.command)
        return ExplainResponse(explanation=result)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

@router.get("/history")
async def get_history(session_id: Optional[str] = None, limit: int = 20):
    mongo_db = get_mongo_db()
    if mongo_db is None:
        return {"logs": [], "note": "MongoDB not connected"}
    return {"logs": _get_history(session_id, limit)}

@router.delete("/cache")
async def clear_cache_route():
    chroma_col = get_chroma_col()
    if chroma_col is None:
        return {"cleared": 0, "note": "Cache not available"}
    cleared = _clear_cache()
    return {"cleared": cleared, "remaining": get_chroma_col().count()}

@router.get("/cache/stats")
async def cache_stats():
    return _cache_stats()

@router.get("/dashboard", include_in_schema=False)
async def dashboard():
    return FileResponse("static/dashboard.html")