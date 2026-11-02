"""Export the active single-HR API contract with shared response/error schemas."""

import json
from copy import deepcopy
from pathlib import Path

from app.main import app


OUTPUT_PATH = Path(__file__).resolve().parents[2] / "docs/api/swagger.json"


def ref(name: str) -> dict:
    return {"$ref": f"#/components/schemas/{name}"}


def array(name: str) -> dict:
    return {"type": "array", "items": ref(name)}


def response(description: str, value: dict) -> dict:
    return {"description": description, "content": {"application/json": {"schema": value}}}


def build_schema() -> dict:
    schema = deepcopy(app.openapi())
    schema["info"]["description"] = "Private one-HR CV evaluation API backed by the nine-table PostgreSQL schema."
    schema["servers"] = [{"url": "http://localhost:8000/api/v1", "description": "Local API"}]
    schema["paths"] = {path.removeprefix("/api/v1"): operations for path, operations in schema["paths"].items()}
    definitions = schema.setdefault("components", {}).setdefault("schemas", {})
    definitions.update({
        "ErrorBody": {"type": "object", "required": ["code", "message", "details", "traceId"],
                      "properties": {"code": {"type": "string"}, "message": {"type": "string"},
                                     "details": {"type": "object", "additionalProperties": True},
                                     "traceId": {"type": "string"}}},
        "ErrorResponse": {"type": "object", "required": ["error"], "properties": {"error": ref("ErrorBody")}},
        "HealthResponse": {"type": "object", "required": ["status", "database", "schema"],
                           "properties": {key: {"type": "string"} for key in ("status", "database", "schema")}},
        "LoginResponse": {"type": "object", "required": ["accessToken", "tokenType", "user"],
                          "properties": {"accessToken": {"type": "string"}, "tokenType": {"type": "string"},
                                         "user": {"type": "object", "required": ["id", "name", "email", "role", "roles"],
                                                  "properties": {"id": {"type": "string", "format": "uuid"},
                                                                 "name": {"type": "string"}, "email": {"type": "string", "format": "email"},
                                                                 "role": {"type": "string"}, "roles": array("RoleName")}}}},
        "RoleName": {"type": "string"},
        "JobResponse": {"type": "object", "required": ["id", "title", "status", "createdAt", "candidateCount"],
                        "properties": {"id": {"type": "string", "format": "uuid"}, "title": {"type": "string"},
                                       "description": {"type": "string"}, "status": {"type": "string", "enum": ["draft", "active", "archived"]},
                                       "createdAt": {"type": "string", "format": "date-time"}, "candidateCount": {"type": "integer"}}},
        "BatchFileResponse": {"type": "object", "required": ["id", "name", "status", "progress"],
                              "properties": {"id": {"type": "string", "format": "uuid"}, "name": {"type": "string"},
                                             "status": {"type": "string"}, "progress": {"type": "integer"},
                                             "candidateId": {"type": ["string", "null"], "format": "uuid"},
                                             "score": {"type": ["number", "null"]}}},
        "BatchResponse": {"type": "object", "required": ["id", "jobId", "name", "status", "totalFiles", "processedFiles", "failedFiles"],
                          "properties": {"id": {"type": "string", "format": "uuid"}, "jobId": {"type": "string", "format": "uuid"},
                                         "name": {"type": "string"}, "status": {"type": "string"},
                                         "totalFiles": {"type": "integer"}, "processedFiles": {"type": "integer"},
                                         "failedFiles": {"type": "integer"}, "files": array("BatchFileResponse")}},
        "CandidateResponse": {"type": "object", "required": ["id", "name", "sourceFilename", "jobId", "applicationId", "score", "recommendation"],
                              "properties": {"id": {"type": "string", "format": "uuid"}, "name": {"type": "string"},
                                             "sourceFilename": {"type": "string"}, "jobId": {"type": "string", "format": "uuid"},
                                             "applicationId": {"type": "string", "format": "uuid"},
                                             "rubricId": {"type": "string", "format": "uuid"},
                                             "score": {"type": ["number", "null"], "minimum": 0, "maximum": 100},
                                             "recommendation": {"type": ["string", "null"]},
                                             "matchedSkills": {"type": "array", "items": {"type": "string"}},
                                             "missingSkills": {"type": "array", "items": {"type": "string"}}}},
        "ProviderStatus": {"type": "object", "required": ["provider", "configured", "privacyMode", "zeroRetentionVerified"],
                           "properties": {"provider": {"type": "string"}, "model": {"type": ["string", "null"]},
                                          "configured": {"type": "boolean"}, "privacyMode": {"type": "string"},
                                          "zeroRetentionVerified": {"type": "boolean"}}},
        "RetentionStatus": {"type": "object", "required": ["retentionDays", "eligibleFiles", "eligibleBytes"],
                            "properties": {"retentionDays": {"type": "integer"}, "eligibleFiles": {"type": "integer"},
                                           "eligibleBytes": {"type": "integer"}}},
    })
    success = {
        ("/health", "get"): ref("HealthResponse"), ("/auth/login", "post"): ref("LoginResponse"),
        ("/jobs", "get"): array("JobResponse"), ("/jobs", "post"): ref("JobResponse"),
        ("/jobs/{jobId}", "get"): ref("JobResponse"), ("/jobs/{jobId}/publish", "post"): ref("JobResponse"),
        ("/jobs/{jobId}/batches", "post"): ref("BatchResponse"), ("/batches", "get"): array("BatchResponse"),
        ("/batches/{batchId}", "get"): ref("BatchResponse"), ("/batches/{batchId}/process", "post"): ref("BatchResponse"),
        ("/candidates", "get"): array("CandidateResponse"), ("/candidates/{candidateId}", "get"): ref("CandidateResponse"),
        ("/candidates/compare", "post"): array("CandidateResponse"),
        ("/settings/ai-provider/status", "get"): ref("ProviderStatus"),
        ("/settings/data-retention", "get"): ref("RetentionStatus"),
    }
    for path, methods in schema["paths"].items():
        for method, operation in methods.items():
            if method not in {"get", "post", "patch", "delete"}:
                continue
            value = success.get((path, method))
            if value:
                code = "201" if (path, method) == ("/jobs", "post") else "202" if (path, method) in {
                    ("/jobs/{jobId}/batches", "post"), ("/batches/{batchId}/process", "post")} else "200"
                operation.setdefault("responses", {})[code] = response("Successful response", value)
            for code, label in {"401": "Authentication required", "404": "Resource not found",
                                "409": "Conflicting operation", "422": "Validation error", "503": "Database or provider unavailable"}.items():
                operation.setdefault("responses", {})[code] = response(label, ref("ErrorResponse"))
            if path == "/jobs/{jobId}/batches" and method == "post":
                for code, label in {"413": "Upload too large", "415": "Unsupported CV format"}.items():
                    operation["responses"][code] = response(label, ref("ErrorResponse"))
            if path == "/settings/ai-provider/test":
                operation["responses"]["429"] = response("Provider rate limit", ref("ErrorResponse"))
    return schema


if __name__ == "__main__":
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(build_schema(), indent=2) + "\n", encoding="utf-8")
    print(f"OpenAPI exported to {OUTPUT_PATH}")
