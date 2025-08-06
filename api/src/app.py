import os
from fastapi import FastAPI, Request
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.utils.schema_parse import SQLSchemaParser
from src.lib.schemas import ErrorResponse
from src.routers import schema_parse_router
import psycopg2
from dotenv import load_dotenv
from loguru import logger

# Load environment variables from .env
load_dotenv()

# Fetch variables
USER = os.getenv("user")
PASSWORD = os.getenv("password")
HOST = os.getenv("host")
PORT = os.getenv("port")
DBNAME = os.getenv("dbname")

# Connect to the database
try:
    connection = psycopg2.connect(
        user=USER,
        password=PASSWORD,
        host=HOST,
        port=PORT,
        dbname=DBNAME
    )
    logger.info("Test Connection successful!")
    
    # Create a cursor to execute SQL queries
    cursor = connection.cursor()
    
    # Example query
    cursor.execute("SELECT NOW();")
    result = cursor.fetchone()
    logger.info(f"Current Time:{result}")

    # Close the cursor and connection
    cursor.close()
    connection.close()
    logger.info("Test Connection closed.")

except Exception as e:
    logger.info(f"Failed to connect: {e}")


# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Global parser instance
parser_instance = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global parser_instance
    parser_instance = SQLSchemaParser()
    yield
    # Cleanup if needed
    parser_instance = None

# FastAPI app with versioning
app = FastAPI(
    title="SQL Schema Parser API",
    description="Parse SQL DDL schemas and generate structured JSON schemas",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/v1/docs",
    redoc_url="/v1/redoc",
    openapi_url="/v1/openapi.json"
)

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    # Return a favicon file if you have one
    if os.path.exists("favicon.ico"):
        return FileResponse("favicon.ico")
    # Or return a 204 No Content to stop the browser from trying
    return Response(status_code=204)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add rate limiting middleware
app.state.limiter = limiter
# Create a wrapper with the correct type signature for FastAPI's add_exception_handler
def rate_limit_exceeded_handler(request: Request, exc: Exception):
    # This wrapper ensures type compatibility while delegating to the original handler
    if isinstance(exc, RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded"}
        )
    # Fallback response if it's not the expected exception type
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"}
    )

app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Include routers
app.include_router(schema_parse_router, prefix="/v1")

@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint redirect"""
    return {"message": "SQL Schema Parser API v1.0", "docs": "/v1/docs"}

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler"""
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal server error",
            details=str(exc),
            code=500
        ).model_dump()
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        access_log=True,
        log_level="info"
    )