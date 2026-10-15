from decorators.login_required import authentication_required
from flask import Blueprint, g, jsonify, request
from runtime import IdentityProvider, RuntimeConfig

oauth_bp = Blueprint("oauth", __name__)

# Signing in (password or SSO) and refreshing tokens happen directly between the
# frontend and Zitadel (OIDC authorization code + PKCE); the backend only
# verifies the resulting access tokens.


@oauth_bp.route("/config", methods=["GET"])
def get_auth_config():
    """Public OIDC settings the frontend needs to start a login."""
    return (
        jsonify(
            {
                "authority": IdentityProvider.issuer,
                "client_id": IdentityProvider.client_id,
                "scope": " ".join(
                    [
                        "openid",
                        "profile",
                        "email",
                        "offline_access",
                        # show the login settings and SSO providers of the LungVisionAI organization
                        f"urn:zitadel:iam:org:id:{IdentityProvider.organization_id}",
                        f"urn:zitadel:iam:org:project:id:{IdentityProvider.project_id}:aud",
                    ]
                ),
                # the SSO provider's Zitadel id, null when SSO is not configured
                "sso_idp_id": RuntimeConfig.get("ZITADEL_SSO_IDP_ID") or None,
            }
        ),
        200,
    )


@oauth_bp.route("/sign_up", methods=["POST"])
def sign_up():
    body = request.get_json(silent=True) or {}
    required = ("email", "password", "first_name", "last_name")
    missing = [field for field in required if not body.get(field)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    try:
        user = IdentityProvider.sign_up_doctor(
            password=body["password"],
            user_email=body["email"],
            user_detail={
                "first_name": body["first_name"],
                "last_name": body["last_name"],
                "occupation": body.get("occupation", ""),
                "organization": body.get("organization", ""),
                "location": body.get("location", ""),
            },
        )
        return (
            jsonify(user),
            200,
        )
    except Exception as e:
        status = getattr(e, "status", 500)
        return (
            jsonify({"error": str(e), "message": getattr(e, "message", "")}),
            status if status in (400, 409) else 500,
        )


@oauth_bp.route("/self", methods=["GET"])
@authentication_required
def get_self_user():
    try:
        # first SSO sign-in: grant the default role; the frontend then refreshes
        # its token so the new scopes are in it
        scopes_granted = IdentityProvider.grant_default_sso_scopes(
            g.auth.user_id, g.auth.scopes
        )
        user = IdentityProvider.get_user_by_id(g.auth.user_id)
        if not user:
            return jsonify({"error": "UserNotFoundException"}), 404
        user["token_refresh_required"] = scopes_granted
        return (
            jsonify(user),
            200,
        )
    except Exception as e:
        return (
            jsonify({"error": str(e)}),
            500,
        )
