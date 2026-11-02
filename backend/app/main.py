import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.compact.router import router as compact_router
from app.core.config import get_settings
from app.core.errors import AppError

settings = get_settings()
logger = logging.getLogger("talentscreen.api")

app = FastAPI(
    title="TalentScreen AI API",
    version="0.1.0",
    description="API for AI-assisted IT candidate screening.",
    openapi_url="/openapi.json",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Trace-Id"],
)


@app.middleware("http")
async def trace_request(request: Request, call_next):
    request.state.trace_id = request.headers.get("X-Trace-Id") or f"req_{uuid4().hex}"
    started_at = perf_counter()
    response = await call_next(request)
    response.headers["X-Trace-Id"] = request.state.trace_id
    logger.info("request_completed trace_id=%s method=%s path=%s status=%s duration_ms=%.2f", request.state.trace_id, request.method, request.url.path, response.status_code, (perf_counter() - started_at) * 1000)
    return response


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    logger.warning("application_error trace_id=%s code=%s path=%s", request.state.trace_id, exc.code, request.url.path)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
                "traceId": getattr(request.state, "trace_id", "local-dev"),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "The request data is invalid.", "details": {"fields": jsonable_encoder(exc.errors())}, "traceId": request.state.trace_id}})


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("database_error trace_id=%s path=%s", request.state.trace_id, request.url.path, exc_info=exc)
    return JSONResponse(status_code=503, content={"error": {"code": "DATABASE_ERROR", "message": "The database operation could not be completed.", "details": {}, "traceId": request.state.trace_id}})


app.include_router(compact_router, prefix="/api/v1")
