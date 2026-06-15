"""Shared DAO exceptions."""

from __future__ import annotations


class DAOError(Exception):
    code: str = "INTERNAL"
    http_status: int = 500

    def __init__(self, message: str, *, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(DAOError):
    code = "NOT_FOUND"
    http_status = 404


class ForbiddenError(DAOError):
    code = "FORBIDDEN"
    http_status = 403


class ConflictError(DAOError):
    code = "CONFLICT"
    http_status = 409


class TierLimitError(DAOError):
    code = "TIER_LIMIT"
    http_status = 402


class ValidationError(DAOError):
    code = "VALIDATION_ERROR"
    http_status = 422


class ServiceUnavailableError(DAOError):
    code = "SERVICE_UNAVAILABLE"
    http_status = 503
