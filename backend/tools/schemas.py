"""Common tool response contracts."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class ToolErrorCode(str, Enum):
    NOT_FOUND = "NOT_FOUND"
    PERMISSION_DENIED = "PERM_DENIED"
    INVALID_PARAM = "INVALID_PARAM"
    DB_ERROR = "DB_ERROR"
    TIMEOUT = "TIMEOUT"
    PARTIAL = "PARTIAL"


class ToolError(BaseModel):
    code: ToolErrorCode
    message: str
    detail: str | None = None


class ToolResponse(BaseModel):
    success: bool
    data: dict | list | None = None
    error: ToolError | None = None
    timestamp: datetime
    source: str
