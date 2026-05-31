"""
auth.py — Google OAuth 2.0 flow + JWT session management.

Environment variables required:
  GOOGLE_CLIENT_ID      — From Google Cloud Console
  GOOGLE_CLIENT_SECRET  — From Google Cloud Console
  JWT_SECRET            — Any long random string (use: openssl rand -hex 32)
  APP_URL               — Your Railway public URL (e.g. https://xxx.up.railway.app)
  ALLOWED_EMAILS        — Comma-separated list of permitted email addresses
                          Leave blank to allow ANY Google account.
  ADMIN_PASSWORD        — Optional bypass password for admin access
                          (issues a synthetic JWT without Google login)
"""
import os
import json
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import requests
import jwt   # PyJWT

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
JWT_SECRET           = os.getenv("JWT_SECRET", "dev-secret-change-in-production-32chars!")
APP_URL              = os.getenv("APP_URL", "http://localhost:8000")
ALLOWED_EMAILS_RAW   = os.getenv("ALLOWED_EMAILS", "")   # empty = allow all
ADMIN_PASSWORD       = os.getenv("ADMIN_PASSWORD", "")   # empty = disabled

GOOGLE_AUTH_URL      = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL     = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL  = "https://www.googleapis.com/oauth2/v2/userinfo"

OAUTH_CALLBACK_PATH  = "/api/auth/google/callback"
JWT_ALGORITHM        = "HS256"
JWT_EXPIRY_DAYS      = 30

# In-memory state store for CSRF protection (good enough for single-instance)
_pending_states: set = set()


def get_callback_url() -> str:
    return f"{APP_URL.rstrip('/')}{OAUTH_CALLBACK_PATH}"


# ── Email whitelist ───────────────────────────────────────────────────────────

def is_allowed_email(email: str) -> bool:
    """
    Returns True if the email is permitted to access the app.
    If ALLOWED_EMAILS is empty, all Google accounts are allowed.
    """
    if not ALLOWED_EMAILS_RAW.strip():
        return True   # open access
    allowed = {e.strip().lower() for e in ALLOWED_EMAILS_RAW.split(",") if e.strip()}
    return email.strip().lower() in allowed


# ── Google OAuth helpers ──────────────────────────────────────────────────────

def build_google_auth_url() -> str:
    """Generate the Google OAuth consent-screen URL with a CSRF state token."""
    state = secrets.token_urlsafe(32)
    _pending_states.add(state)
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  get_callback_url(),
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         state,
        "access_type":   "online",
        "prompt":        "select_account",   # always show account picker
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}"


def validate_state(state: str) -> bool:
    """Verify the OAuth state token to prevent CSRF."""
    if state in _pending_states:
        _pending_states.discard(state)
        return True
    return False


def exchange_code_for_tokens(code: str) -> Optional[Dict]:
    """Exchange the OAuth authorisation code for Google access + id tokens."""
    try:
        resp = requests.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  get_callback_url(),
            "grant_type":    "authorization_code",
        }, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Google token exchange failed: {e}")
        return None


def get_google_user_info(access_token: str) -> Optional[Dict]:
    """Fetch the user's email, name, and picture from Google."""
    try:
        resp = requests.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Google userinfo fetch failed: {e}")
        return None


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_jwt(user_id: str, email: str, name: str, picture: str = "") -> str:
    """Issue a signed JWT that expires in JWT_EXPIRY_DAYS days."""
    payload = {
        "sub":     user_id,
        "email":   email,
        "name":    name,
        "picture": picture,
        "exp":     datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
        "iat":     datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt(token: str) -> Dict[str, Any]:
    """
    Decode and verify a JWT. Returns the payload dict on success.
    Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on failure.
    """
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Parse 'Bearer <token>' header."""
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


# ── Admin bypass ──────────────────────────────────────────────────────────────

ADMIN_USER_ID    = "admin-bypass"
ADMIN_USER_EMAIL = "admin@ksbhoon.local"
ADMIN_USER_NAME  = "Dr KS Bhoon (Admin)"

def verify_admin_password(password: str) -> Optional[str]:
    """
    If ADMIN_PASSWORD is set and matches, return a JWT for the admin user.
    Returns None if the bypass is disabled or the password is wrong.
    """
    if not ADMIN_PASSWORD or not password:
        return None
    if password == ADMIN_PASSWORD:
        return create_jwt(ADMIN_USER_ID, ADMIN_USER_EMAIL, ADMIN_USER_NAME, "")
    return None
