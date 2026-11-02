from fastapi import APIRouter

from app.compact.auth_jobs import router as auth_jobs_router
from app.compact.audit import router as audit_router
from app.compact.candidates import router as candidates_router
from app.compact.decisions import router as decisions_router
from app.compact.screening import router as screening_router
from app.compact.settings import router as settings_router


router = APIRouter()
router.include_router(auth_jobs_router, tags=["compact-auth-jobs"])
router.include_router(screening_router, tags=["compact-screening"])
router.include_router(candidates_router, tags=["compact-candidates"])
router.include_router(decisions_router, tags=["compact-decisions"])
router.include_router(settings_router, tags=["compact-settings"])
router.include_router(audit_router, tags=["compact-audit"])
