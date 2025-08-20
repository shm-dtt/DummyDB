import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import BaseModel
from dotenv import load_dotenv
load_dotenv()

from src.utils.migrations import migrator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router with tags for better API documentation
router = APIRouter(tags=["Database Migrations"], prefix="/migrations")

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Pydantic models for request/response validation
class MigrationResponse(BaseModel):
    success: bool
    message: str
    migration_name: Optional[str] = None
    execution_time_ms: Optional[int] = None
    results: Optional[List[Dict[str, Any]]] = None

class MigrationStatusResponse(BaseModel):
    success: bool
    migrations: List[Dict[str, Any]]
    total_migrations: int

class ExecuteMigrationRequest(BaseModel):
    migration_name: str
    sql_content: str
    force_execute: bool = False

@router.get("/health")
@limiter.limit("100/minute")
async def migration_health_check(request: Request):
    """Health check for migration system"""
    try:
        # Check if migrations directory exists
        migrations_dir = Path("./migrations")
        migrations_exist = migrations_dir.exists()
        
        # Count migration files
        migration_files = list(migrations_dir.glob("*.sql")) if migrations_exist else []
        
        return {
            "status": "healthy",
            "migrations_directory_exists": migrations_exist,
            "migration_files_count": len(migration_files),
            "migration_files": [f.name for f in migration_files]
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@router.post("/auto-migrate", response_model=MigrationResponse)
@limiter.limit("5/minute")
async def run_auto_migration(request: Request):
    """
    Automatically run all pending migrations including schema_parse enhancements
    
    This endpoint will:
    1. Create the migrations tracking table if needed
    2. Create the schema_parse enhancement migration if it doesn't exist
    3. Run all pending migrations
    4. Return detailed results
    """
    try:
        logger.info("Starting auto-migration process")
        result = migrator.auto_migrate()
        
        if result["success"]:
            logger.info(f"Auto-migration completed successfully: {result['message']}")
            return MigrationResponse(
                success=True,
                message=result["message"],
                results=result.get("results", [])
            )
        else:
            logger.error(f"Auto-migration failed: {result['message']}")
            return MigrationResponse(
                success=False,
                message=result["message"],
                results=result.get("results", [])
            )
            
    except Exception as e:
        error_msg = f"Auto-migration failed with exception: {str(e)}"
        logger.error(error_msg)
        return MigrationResponse(
            success=False,
            message=error_msg
        )

@router.post("/execute", response_model=MigrationResponse)
@limiter.limit("10/minute")
async def execute_migration(
    request: Request,
    migration_request: ExecuteMigrationRequest
):
    """
    Execute a specific migration with provided SQL content
    
    Args:
        migration_request: Contains migration name, SQL content, and force flag
    """
    try:
        logger.info(f"Executing migration: {migration_request.migration_name}")
        
        # Check if migration already exists and force flag
        if not migration_request.force_execute:
            migration_hash = migrator.get_migration_hash(migration_request.sql_content)
            if migrator.is_migration_executed(migration_request.migration_name, migration_hash):
                return MigrationResponse(
                    success=True,
                    message=f"Migration {migration_request.migration_name} already executed (use force_execute=true to re-run)"
                )
        
        result = migrator.execute_sql_migration(
            migration_request.migration_name, 
            migration_request.sql_content
        )
        
        return MigrationResponse(
            success=result["success"],
            message=result["message"],
            migration_name=migration_request.migration_name,
            execution_time_ms=result.get("execution_time_ms")
        )
        
    except Exception as e:
        error_msg = f"Failed to execute migration: {str(e)}"
        logger.error(error_msg)
        return MigrationResponse(
            success=False,
            message=error_msg,
            migration_name=migration_request.migration_name
        )

@router.post("/execute-file")
@limiter.limit("10/minute")
async def execute_migration_file(
    request: Request,
    file: UploadFile = File(..., description="SQL migration file to execute"),
    force_execute: bool = Query(False, description="Force execute even if already run"),
    migration_name: Optional[str] = Query(None, description="Custom migration name (defaults to filename)")
):
    """
    Execute migration from uploaded SQL file
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.endswith('.sql'):
            raise HTTPException(
                status_code=400,
                detail="File must have .sql extension"
            )
        
        # Read file content
        content = await file.read()
        sql_content = content.decode('utf-8')
        
        # Use custom name or filename
        name = migration_name or Path(file.filename).stem
        
        logger.info(f"Executing migration file: {file.filename} as {name}")
        
        # Check if migration already exists
        if not force_execute:
            migration_hash = migrator.get_migration_hash(sql_content)
            if migrator.is_migration_executed(name, migration_hash):
                return MigrationResponse(
                    success=True,
                    message=f"Migration {name} already executed (use force_execute=true to re-run)"
                )
        
        result = migrator.execute_sql_migration(name, sql_content)
        
        return MigrationResponse(
            success=result["success"],
            message=result["message"],
            migration_name=name,
            execution_time_ms=result.get("execution_time_ms")
        )
        
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="File must be valid UTF-8 encoded text"
        )
    except Exception as e:
        error_msg = f"Failed to execute migration file: {str(e)}"
        logger.error(error_msg)
        return MigrationResponse(
            success=False,
            message=error_msg
        )

@router.get("/status", response_model=MigrationStatusResponse)
@limiter.limit("50/minute")
async def get_migration_status(request: Request):
    """Get status of all executed migrations"""
    try:
        result = migrator.get_migration_status()
        
        if result["success"]:
            return MigrationStatusResponse(
                success=True,
                migrations=result["migrations"],
                total_migrations=result["total_migrations"]
            )
        else:
            return MigrationStatusResponse(
                success=False,
                migrations=[],
                total_migrations=0
            )
            
    except Exception as e:
        logger.error(f"Failed to get migration status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get migration status: {str(e)}"
        )

@router.post("/create-schema-parse-migration", response_model=MigrationResponse)
@limiter.limit("5/minute")
async def create_schema_parse_migration(request: Request):
    """
    Create the schema_parse table enhancements migration file
    
    This creates a migration file with all the necessary changes:
    - Add filename, content_hash, file_size, updated_at columns
    - Add indexes for performance
    - Update RLS policies
    """
    try:
        migration_filename = migrator.create_schema_parse_migration()
        
        return MigrationResponse(
            success=True,
            message=f"Schema parse migration created: {migration_filename}",
            migration_name=migration_filename
        )
        
    except Exception as e:
        error_msg = f"Failed to create schema parse migration: {str(e)}"
        logger.error(error_msg)
        return MigrationResponse(
            success=False,
            message=error_msg
        )

@router.get("/files")
@limiter.limit("50/minute")
async def list_migration_files(request: Request):
    """List all migration files in the migrations directory"""
    try:
        migrations_dir = Path("./migrations")
        
        if not migrations_dir.exists():
            return {
                "success": True,
                "message": "Migrations directory does not exist",
                "migration_files": []
            }
        
        migration_files = []
        for file_path in sorted(migrations_dir.glob("*.sql")):
            try:
                stat = file_path.stat()
                migration_files.append({
                    "filename": file_path.name,
                    "size_bytes": stat.st_size,
                    "created_at": stat.st_ctime,
                    "modified_at": stat.st_mtime
                })
            except Exception as e:
                logger.warning(f"Could not get stats for {file_path.name}: {e}")
                migration_files.append({
                    "filename": file_path.name,
                    "size_bytes": 0,
                    "created_at": 0,
                    "modified_at": 0,
                    "error": str(e)
                })
        
        return {
            "success": True,
            "migration_files": migration_files,
            "total_files": len(migration_files)
        }
        
    except Exception as e:
        logger.error(f"Failed to list migration files: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list migration files: {str(e)}"
        )

@router.post("/init")
@limiter.limit("5/minute")
async def initialize_migration_system(request: Request):
    """
    Initialize the migration system:
    1. Create migrations directory
    2. Create migrations tracking table
    3. Create initial schema_parse migration
    """
    try:
        results = []
        
        # Create migrations directory
        migrations_dir = Path("./migrations")
        migrations_dir.mkdir(exist_ok=True)
        results.append("✅ Migrations directory created/verified")
        
        # Create migrations tracking table
        table_created = migrator.create_migrations_table()
        if table_created:
            results.append("✅ Migrations tracking table created/verified")
        else:
            results.append("⚠️ Could not verify migrations tracking table")
        
        # Create schema_parse migration
        try:
            migration_file = migrator.create_schema_parse_migration()
            results.append(f"✅ Schema parse migration created: {migration_file}")
        except Exception as e:
            results.append(f"⚠️ Could not create schema parse migration: {e}")
        
        return {
            "success": True,
            "message": "Migration system initialized",
            "results": results
        }
        
    except Exception as e:
        error_msg = f"Failed to initialize migration system: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "message": error_msg,
            "results": []
        }

@router.delete("/reset")
@limiter.limit("2/minute")
async def reset_migration_history(
    request: Request,
    confirm: str = Query(..., description="Type 'CONFIRM' to reset migration history")
):
    """
    Reset migration history (dangerous operation)
    
    This will clear the migrations tracking table but won't undo the actual migrations.
    Use with caution!
    """
    if confirm != "CONFIRM":
        raise HTTPException(
            status_code=400,
            detail="Must provide confirm='CONFIRM' to reset migration history"
        )
    
    try:
        supabase = migrator.get_supabase_client()
        
        # Delete all migration records
        result = supabase.table('schema_migrations').delete().neq('id', 0).execute()
        
        deleted_count = len(result.data) if result.data else 0
        
        logger.warning(f"Migration history reset - deleted {deleted_count} records")
        
        return {
            "success": True,
            "message": f"Migration history reset - deleted {deleted_count} migration records",
            "deleted_count": deleted_count
        }
        
    except Exception as e:
        error_msg = f"Failed to reset migration history: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )