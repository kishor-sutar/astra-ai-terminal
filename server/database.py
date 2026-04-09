import platform
from datetime import datetime, timezone
from typing import Optional
from config import MONGO_URI
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

mongo_db = None

def init_database():
    global mongo_db
    try:
        client   = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        client.admin.command("ping")
        mongo_db = client["astra_ai"]
        print(f"✅ MongoDB connected (uri={MONGO_URI})")
    except ConnectionFailure as e:
        print(f"⚠️  MongoDB unavailable: {e} — logging disabled")
        mongo_db = None

def get_mongo_db():
    return mongo_db

def log_command(query: str, shell: str, command: str,
                cache_hit: bool, session_id: Optional[str],
                rag_assisted: bool = False):
                
    if mongo_db is None:
        return
    try:
        mongo_db.command_logs.insert_one({
            "query":      query,
            "shell":      shell,
            "command":    command,
            "cache_hit":  cache_hit,
            "session_id": session_id,
            "timestamp":  datetime.now(timezone.utc),
            "os":         platform.system(),
            "rag_assisted": rag_assisted,
        })
    except Exception as e:
        print(f"Mongo log error: {e}")

def get_history(session_id: Optional[str] = None, limit: int = 20):
    if mongo_db is None:
        return []
    query_filter = {}
    if session_id:
        query_filter["session_id"] = session_id
    logs = list(
        mongo_db.command_logs
        .find(query_filter, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )
    for log in logs:
        if "timestamp" in log:
            log["timestamp"] = log["timestamp"].isoformat()
    return logs