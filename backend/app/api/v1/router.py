from fastapi import APIRouter

from app.features.admin.routes import router as admin_router
from app.features.auth.routes import router as auth_router
from app.features.candidates.routes import router as candidates_router
from app.features.jobs.routes import router as jobs_router
from app.features.reports.routes import router as reports_router
from app.features.reviews.routes import router as reviews_router
from app.features.screening.routes import router as screening_router
from app.features.shortlists.routes import router as shortlists_router
from app.features.settings.routes import router as settings_router
from app.features.system.routes import router as system_router

api_router = APIRouter()
api_router.include_router(system_router, tags=["system"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
api_router.include_router(screening_router, tags=["screening"])
api_router.include_router(candidates_router, prefix="/candidates", tags=["candidates"])
api_router.include_router(reviews_router, prefix="/review-queue", tags=["reviews"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
api_router.include_router(shortlists_router, prefix="/shortlists", tags=["shortlists"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])
