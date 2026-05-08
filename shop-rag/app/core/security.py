import logging
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.core.config import Settings, get_settings


logger = logging.getLogger(__name__)
security = HTTPBasic(auto_error=False)


def require_admin(
    request: Request,
    credentials: Annotated[HTTPBasicCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    if credentials is None:
        logger.warning("Admin login missing credentials from %s", request.client.host if request.client else "unknown")
        raise _auth_error()

    username_ok = secrets.compare_digest(credentials.username, settings.admin_username)
    password_ok = secrets.compare_digest(credentials.password, settings.admin_password)
    if not (username_ok and password_ok):
        logger.warning("Admin login failed for username=%s", credentials.username)
        raise _auth_error()

    logger.info("Admin login succeeded for username=%s", credentials.username)
    return credentials.username


def _auth_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Admin login required",
        headers={"WWW-Authenticate": "Basic"},
    )
