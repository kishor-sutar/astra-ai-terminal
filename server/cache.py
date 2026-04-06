import re
from config import CHROMA_PATH, SIMILARITY_THRESHOLD
import chromadb
from chromadb.utils import embedding_functions

chroma_col = None

def init_cache():
    global chroma_col
    try:
        ef            = embedding_functions.DefaultEmbeddingFunction()
        chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
        chroma_col    = chroma_client.get_or_create_collection(
            name="astra_cache",
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )
        print(f"✅ ChromaDB ready  (path={CHROMA_PATH}, docs={chroma_col.count()})")
    except Exception as e:
        print(f"⚠️  ChromaDB init failed: {e}")
        chroma_col = None

def get_chroma_col():
    return chroma_col

def _cache_key(query: str, shell: str) -> str:
    normalized = re.sub(r'\.[\w-]+|[\w-]+\.\w+', '<file>', query.strip().lower())
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return f"{shell}::{normalized}"

def substitute_filenames(query: str, cached_cmd: str) -> str:
    pattern   = r'\.[\w-]+|[\w-]+\.\w+'
    new_files = re.findall(pattern, query)
    old_files = re.findall(pattern, cached_cmd)
    if new_files and old_files:
        for old_f, new_f in zip(old_files, new_files):
            cached_cmd = cached_cmd.replace(old_f, new_f, 1)
    return cached_cmd

def search_cache(query: str, shell: str):
    if chroma_col is None:
        return None, None
    try:
        results = chroma_col.query(
            query_texts=[_cache_key(query, shell)],
            n_results=1,
            include=["documents", "metadatas", "distances"],
        )
        if not results["ids"][0]:
            return None, None
        similarity = 1.0 - results["distances"][0][0]
        if similarity >= SIMILARITY_THRESHOLD:
            command = results["metadatas"][0][0]["command"]
            return command, round(similarity, 4)
        return None, round(similarity, 4)
    except Exception as e:
        print(f"Cache search error: {e}")
        return None, None

def store_cache(query: str, shell: str, command: str):
    if chroma_col is None:
        return
    try:
        key = _cache_key(query, shell)
        chroma_col.upsert(
            ids=[key],
            documents=[key],
            metadatas=[{"command": command, "shell": shell, "query": query}],
        )
    except Exception as e:
        print(f"Cache store error: {e}")

def clear_cache():
    if chroma_col is None:
        return 0
    before = chroma_col.count()
    chroma_col.delete(where={"shell": {"$ne": "__impossible__"}})
    return before

def cache_stats():
    from config import SIMILARITY_THRESHOLD, GEMINI_MODEL
    if chroma_col is None:
        return {"count": 0, "status": "disabled"}
    return {
        "count":     chroma_col.count(),
        "threshold": SIMILARITY_THRESHOLD,
        "backend":   "chromadb",
        "path":      CHROMA_PATH,
        "model":     GEMINI_MODEL,
    }