from typing import Optional
from pydantic import BaseModel

class CommandRequest(BaseModel):
    query:      str
    shell:      str           = "bash"
    session_id: Optional[str] = None
    os_info:    Optional[str] = None
    history:    list          = []

class CommandResponse(BaseModel):
    command:      str
    shell:        str
    cache_hit:    bool
    rag_assisted: bool            = False
    similarity:   Optional[float] = None
    session_id:   Optional[str]   = None

class ExplainRequest(BaseModel):
    command: str
    shell:   str = "bash"

class ExplainResponse(BaseModel):
    explanation: str

class HealthResponse(BaseModel):
    status:     str
    version:    str
    components: dict