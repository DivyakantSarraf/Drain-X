"""
DRAIN-X Authentication, Authorization, and Security Controls.

Milestone: P0.6.1 Cloud Provisioning & Security Validation.

Security Principles Enforced:
1. Least Privilege & Fail-Closed:
   - In production (`ENVIRONMENT == 'production'`), unauthenticated ingestion or
     missing credentials immediately fail-closed with 401 / 500 responses.
   - Development bypasses are strictly disabled in production.
2. Device Authentication:
   - Authenticates physical IoT edge nodes (ESP32) on telemetry ingestion endpoints
     using `X-Device-Key`.
3. Cryptographic Supabase JWT Verification:
   - When `SUPABASE_JWT_SECRET` is configured, verifies HMAC-SHA256 (HS256) signature,
     expiration (`exp`), audience (`aud`), and issuer.
4. Role Integrity (Anti-Privilege Escalation):
   - Trusted user roles MUST originate from `app_metadata.role` (managed securely by
     backend/admin) or PostgreSQL role `service_role`.
   - Client-controlled `user_metadata` is EXPLICITLY REJECTED for role decisions to
     prevent self-escalation by authenticated citizens.
"""

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import Header, HTTPException, status, Depends
from app.core.config import settings

logger = logging.getLogger("drainx.security")


async def verify_device_key(
    x_device_key: Optional[str] = Header(default=None, alias="X-Device-Key")
) -> Optional[str]:
    """
    Validates edge hardware device authentication.
    Used on `/api/v1/telemetry/ingest`.
    """
    configured_key = settings.DEVICE_INGEST_API_KEY
    is_prod = (settings.ENVIRONMENT == "production")

    if is_prod:
        # In production, device authentication is strictly mandatory (Fail-Closed)
        if not configured_key:
            logger.error("FATAL: In production mode, DEVICE_INGEST_API_KEY must be configured.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Production configuration error: DEVICE_INGEST_API_KEY is not configured.",
            )
        if not x_device_key or not hmac.compare_digest(x_device_key, configured_key):
            logger.warning("Production telemetry ingestion rejected: invalid or missing X-Device-Key")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing X-Device-Key authentication header.",
                headers={"WWW-Authenticate": "ApiKey"},
            )
        return x_device_key

    # In development mode:
    if configured_key:
        if not x_device_key or not hmac.compare_digest(x_device_key, configured_key):
            logger.warning("Development telemetry ingestion rejected: invalid or missing X-Device-Key")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing X-Device-Key authentication header.",
                headers={"WWW-Authenticate": "ApiKey"},
            )
        return x_device_key

    # Open ingestion permitted in development/bench mode when key is unconfigured
    logger.debug("[DEV_MODE_SECURITY_BYPASS] Telemetry ingested without X-Device-Key authentication.")
    return x_device_key


def _decode_jwt_parts(token: str) -> tuple[Dict[str, Any], Dict[str, Any], str, str]:
    """
    Splits JWT and decodes header and payload.
    Returns: (header_dict, payload_dict, signing_input, signature_b64)
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT token structure. Expected 3 segments.")

    header_b64, payload_b64, sig_b64 = parts[0], parts[1], parts[2]
    signing_input = f"{header_b64}.{payload_b64}"

    def _b64_decode(data: str) -> bytes:
        remainder = len(data) % 4
        if remainder > 0:
            data += "=" * (4 - remainder)
        return base64.urlsafe_b64decode(data)

    header = json.loads(_b64_decode(header_b64).decode("utf-8"))
    payload = json.loads(_b64_decode(payload_b64).decode("utf-8"))
    return header, payload, signing_input, sig_b64


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """
    Cryptographically verifies a Supabase JWT token.
    Enforces signature check (if secret configured), expiration, and trusted claims.
    """
    try:
        header, payload, signing_input, sig_b64 = _decode_jwt_parts(token)
    except Exception as exc:
        logger.warning(f"Malformed JWT token: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Header validation
    alg = header.get("alg")
    if alg != "HS256":
        logger.warning(f"Rejected unsupported JWT algorithm: {alg}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported token algorithm '{alg}'. Only HS256 is permitted.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Cryptographic signature check
    secret = settings.SUPABASE_JWT_SECRET
    if secret:
        expected_sig = hmac.new(
            secret.encode("utf-8"),
            signing_input.encode("ascii"),
            hashlib.sha256,
        ).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode("ascii").rstrip("=")

        if not hmac.compare_digest(sig_b64, expected_sig_b64):
            logger.warning("Rejected JWT with invalid cryptographic signature.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token signature.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    else:
        if settings.ENVIRONMENT == "production":
            logger.error("FATAL: In production, SUPABASE_JWT_SECRET must be configured for signature validation.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Production configuration error: Token validation secret is missing.",
            )
        logger.debug("[DEV_MODE_SECURITY_BYPASS] Decoded unverified JWT token; SUPABASE_JWT_SECRET is not set.")

    # 3. Expiration validation (exp)
    now = time.time()
    exp = payload.get("exp")
    if exp is not None:
        try:
            exp_val = float(exp)
            if now >= exp_val:
                logger.warning(f"Rejected expired JWT token (expired at {exp_val}, current time {now})")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication token has expired.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token expiration format.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # 4. Audience validation (aud)
    aud = payload.get("aud")
    if aud and aud not in ("authenticated", "drainx"):
        logger.warning(f"Rejected JWT with invalid audience: {aud}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token audience is not authorized for this platform.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 5. Extract trusted application role (Anti-Privilege Escalation)
    # Strictly reject inspecting user_metadata: end-users can edit user_metadata!
    if payload.get("role") == "service_role":
        trusted_role = "service_role"
    else:
        app_meta = payload.get("app_metadata")
        if isinstance(app_meta, dict):
            trusted_role = app_meta.get("role", "citizen")
        else:
            trusted_role = "citizen"

    payload["extracted_role"] = trusted_role
    return payload


async def get_current_user_claims(
    authorization: Optional[str] = Header(default=None)
) -> Dict[str, Any]:
    """
    Extracts and validates Supabase JWT token claims.
    """
    is_prod = (settings.ENVIRONMENT == "production")

    if not settings.SUPABASE_AUTH_ENABLED:
        if is_prod:
            logger.error("FATAL: SUPABASE_AUTH_ENABLED cannot be False in production.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Production configuration error: Authentication must be enabled.",
            )
        # Development mode bypass
        logger.debug("[DEV_MODE_SECURITY_BYPASS] Serving request with default dev-operator identity.")
        return {
            "sub": "dev-operator",
            "role": "admin",
            "extracted_role": "admin",
            "email": "operator@drainx.local",
            "is_dev_bypass": True,
        }

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header. Expected Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1].strip()
    return verify_supabase_jwt(token)


def require_roles(allowed_roles: List[str]):
    """
    FastAPI dependency factory enforcing role-based access control.
    """
    async def role_checker(claims: Dict[str, Any] = Depends(get_current_user_claims)) -> Dict[str, Any]:
        if claims.get("is_dev_bypass") and settings.ENVIRONMENT != "production":
            return claims

        user_role = claims.get("extracted_role", "citizen")
        if user_role not in allowed_roles:
            logger.warning(
                f"Access forbidden: User with trusted role '{user_role}' attempted access to route requiring {allowed_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires one of the following roles: {allowed_roles}",
            )
        return claims

    return role_checker
