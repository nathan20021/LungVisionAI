from dataclasses import dataclass
from functools import wraps

import jwt
from flask import g, jsonify, request
from runtime import IdentityProvider
from scopes import is_doctor, is_patient


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    scopes: frozenset

    def has_scope(self, scope):
        return scope in self.scopes

    @property
    def is_doctor(self):
        return is_doctor(self.scopes)

    @property
    def is_patient(self):
        return is_patient(self.scopes)


def authentication_required(f):
    """Verify the Zitadel access token and expose the caller as flask.g.auth."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return jsonify({"message": "Authorization token is missing."}), 401

        parts = auth_header.split()

        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"message": "Invalid Authorization header format."}), 401

        access_token = parts[1]

        try:
            claims = IdentityProvider.verify_access_token(access_token)
        except jwt.PyJWKClientConnectionError:
            return jsonify({"message": "Identity provider unavailable."}), 503
        except jwt.PyJWTError:
            return jsonify({"message": "Invalid or expired token."}), 401

        g.auth = AuthenticatedUser(
            user_id=claims["sub"],
            scopes=frozenset(IdentityProvider.scopes_from_claims(claims)),
        )
        return f(*args, **kwargs)

    return decorated_function


def requires_scopes(*scopes):
    """Allow the request only when the caller's token holds every scope."""

    def decorator(f):
        @wraps(f)
        @authentication_required
        def decorated_function(*args, **kwargs):
            missing = [scope for scope in scopes if not g.auth.has_scope(scope)]
            if missing:
                return jsonify({"message": "Missing required scope.", "missing_scopes": missing}), 403
            return f(*args, **kwargs)

        return decorated_function

    return decorator


def requires_doctor_or_own_patient_scope(doctor_scope, patient_scope, user_arg="userId"):
    """Doctors need doctor_scope; patients need patient_scope and only reach their own user."""

    def decorator(f):
        @wraps(f)
        @authentication_required
        def decorated_function(*args, **kwargs):
            if g.auth.has_scope(doctor_scope):
                return f(*args, **kwargs)
            if g.auth.has_scope(patient_scope) and kwargs.get(user_arg) == g.auth.user_id:
                return f(*args, **kwargs)
            return jsonify({"message": "Missing required scope.", "missing_scopes": [doctor_scope]}), 403

        return decorated_function

    return decorator
