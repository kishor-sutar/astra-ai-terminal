import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY       = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL         = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
MONGO_URI            = os.getenv("MONGO_URI", "mongodb://localhost:27017")
CHROMA_PATH          = os.getenv("CHROMA_PATH", "./chroma_store")
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.9"))
MAX_CONTEXT          = int(os.getenv("MAX_CONTEXT", "3"))
PORT                 = int(os.getenv("ASTRA_PORT", "7771"))
MAX_RETRIEVAL = int(os.getenv("MAX_RETRIEVAL", "3"))



MYSQL_HOST     = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT     = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER     = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "")