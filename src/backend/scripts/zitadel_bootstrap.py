"""Configure Zitadel for LungVisionAI. Safe to run repeatedly.

Creates (or updates) the project with the doctor:* / patient:* roles, the OIDC
app used by the frontend, the backend service user, the organization login
settings and, when SSO_OIDC_ISSUER is set, an SSO identity provider. The IDs and
the service user token the backend needs are written to ZITADEL_CONFIG_FILE.

Run inside the stack with `docker compose run --rm zitadel-bootstrap`, or let
`docker compose up` run it before the backend starts.

Environment:
    ZITADEL_ISSUER          public Zitadel URL, e.g. http://localhost:8080
    ZITADEL_API_URL         URL this script reaches Zitadel on (defaults to the issuer)
    ZITADEL_ADMIN_PAT_FILE  token of an IAM owner (written by Zitadel's first-instance setup)
    ZITADEL_CONFIG_FILE     where to write the generated backend settings
    FRONTEND_URLS           comma-separated frontend origins allowed to log in
    SSO_OIDC_NAME, SSO_OIDC_ISSUER, SSO_OIDC_CLIENT_ID, SSO_OIDC_CLIENT_SECRET
                            optional generic OIDC provider (Entra ID, Google, Okta, ...)
"""

import json
import os
import sys
import time
from urllib.parse import urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scopes import ROLE_DEFINITIONS  # noqa: E402

PROJECT_NAME = "LungVisionAI"
APP_NAME = "LungVisionAI Web"
SERVICE_USER_NAME = "lungvision-backend"
SERVICE_USER_ROLE = "ORG_USER_MANAGER"
TEXT_EQUALS = "TEXT_FILTER_METHOD_EQUALS"

ISSUER = os.environ["ZITADEL_ISSUER"].rstrip("/")
API_URL = os.getenv("ZITADEL_API_URL", ISSUER).rstrip("/")
ADMIN_PAT_FILE = os.environ["ZITADEL_ADMIN_PAT_FILE"]
CONFIG_FILE = os.environ["ZITADEL_CONFIG_FILE"]
FRONTEND_URLS = [
    url.strip().rstrip("/")
    for url in os.getenv("FRONTEND_URLS", "http://localhost:3000").split(",")
    if url.strip()
]


class ZitadelAPIError(Exception):
    def __init__(self, status, body):
        super().__init__(f"{status}: {body}")
        self.status = status
        self.body = body


class Zitadel:
    def __init__(self, token, org_id=None):
        self.session = requests.Session()
        # Zitadel resolves the instance from the Host header
        self.session.headers["Host"] = urlparse(ISSUER).netloc
        self.session.headers["Authorization"] = f"Bearer {token}"
        if org_id:
            self.session.headers["x-zitadel-orgid"] = org_id

    def call(self, method, path, body=None):
        response = self.session.request(method, API_URL + path, json=body, timeout=30)
        if not response.ok:
            raise ZitadelAPIError(response.status_code, response.text)
        return response.json() if response.content else {}

    def update(self, method, path, body):
        """Like call(), but an update that changes nothing is not an error."""
        try:
            return self.call(method, path, body)
        except ZitadelAPIError as err:
            # the wording differs per API: "No changes", "Errors.<Resource>.NotChanged",
            # "<Resource> has not been changed"
            body = err.body.lower()
            if err.status == 400 and any(
                text in body for text in ("no changes", "notchanged", "not been changed")
            ):
                return {}
            raise


def wait_for_admin_token(timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(ADMIN_PAT_FILE):
            token = open(ADMIN_PAT_FILE).read().strip()
            try:
                Zitadel(token).call("GET", "/management/v1/orgs/me")
                return token
            except (requests.ConnectionError, ZitadelAPIError):
                pass
        time.sleep(2)
    sys.exit(f"Zitadel is not reachable at {API_URL} or {ADMIN_PAT_FILE} is missing")


def ensure_project(z, org_id):
    projects = z.call(
        "POST",
        "/zitadel.project.v2.ProjectService/ListProjects",
        {
            "filters": [
                {"organizationIdFilter": {"organizationId": org_id}},
                {"projectNameFilter": {"projectName": PROJECT_NAME, "method": TEXT_EQUALS}},
            ]
        },
    ).get("projects", [])
    if projects:
        project_id = projects[0]["projectId"]
        z.update(
            "POST",
            "/zitadel.project.v2.ProjectService/UpdateProject",
            {"projectId": project_id, "projectRoleAssertion": True},
        )
    else:
        project_id = z.call(
            "POST",
            "/zitadel.project.v2.ProjectService/CreateProject",
            {
                "organizationId": org_id,
                "name": PROJECT_NAME,
                # put the user's roles into tokens, so the backend can check scopes locally
                "projectRoleAssertion": True,
                # first-time SSO users have no role yet; the backend grants it
                "authorizationRequired": False,
            },
        )["projectId"]
    print(f"project {PROJECT_NAME}: {project_id}")
    return project_id


def ensure_roles(z, project_id):
    existing = {
        role["key"]: role
        for role in z.call(
            "POST",
            "/zitadel.project.v2.ProjectService/ListProjectRoles",
            {"projectId": project_id, "pagination": {"limit": 1000}},
        ).get("projectRoles", [])
    }
    for key, (display_name, group) in ROLE_DEFINITIONS.items():
        role = {"projectId": project_id, "roleKey": key, "displayName": display_name, "group": group}
        if key not in existing:
            z.call("POST", "/zitadel.project.v2.ProjectService/AddProjectRole", role)
        elif (existing[key].get("displayName"), existing[key].get("group")) != (display_name, group):
            z.update("POST", "/zitadel.project.v2.ProjectService/UpdateProjectRole", role)
    print(f"roles: {', '.join(ROLE_DEFINITIONS)}")


def ensure_app(z, project_id):
    oidc_config = {
        "redirectUris": [f"{url}/callback" for url in FRONTEND_URLS],
        "postLogoutRedirectUris": [f"{url}/" for url in FRONTEND_URLS],
        "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
        "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
        "applicationType": "OIDC_APP_TYPE_USER_AGENT",
        # public client: the browser uses PKCE instead of a client secret
        "authMethodType": "OIDC_AUTH_METHOD_TYPE_NONE",
        # allows http:// redirect URIs; turn off once the frontend is served over https
        "developmentMode": any(url.startswith("http://") for url in FRONTEND_URLS),
        # JWT access tokens can be verified by the backend without calling Zitadel
        "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
        "accessTokenRoleAssertion": True,
        "idTokenRoleAssertion": True,
        "idTokenUserinfoAssertion": True,
    }
    apps = z.call(
        "POST",
        "/zitadel.application.v2.ApplicationService/ListApplications",
        {
            "filters": [
                {"projectIdFilter": {"projectId": project_id}},
                {"nameFilter": {"name": APP_NAME, "method": TEXT_EQUALS}},
            ]
        },
    ).get("applications", [])
    if apps:
        app = apps[0]
        z.update(
            "POST",
            "/zitadel.application.v2.ApplicationService/UpdateApplication",
            {
                "applicationId": app["applicationId"],
                "projectId": project_id,
                "name": APP_NAME,
                "oidcConfiguration": oidc_config,
            },
        )
        client_id = app["oidcConfiguration"]["clientId"]
    else:
        client_id = z.call(
            "POST",
            "/zitadel.application.v2.ApplicationService/CreateApplication",
            {"projectId": project_id, "name": APP_NAME, "oidcConfiguration": oidc_config},
        )["oidcConfiguration"]["clientId"]
    print(f"app {APP_NAME}: client_id {client_id}, redirect URIs {oidc_config['redirectUris']}")
    return client_id


def ensure_service_user(z, org_id, previous_token):
    users = z.call(
        "POST",
        "/v2/users",
        {
            "queries": [
                {"organizationIdQuery": {"organizationId": org_id}},
                {"userNameQuery": {"userName": SERVICE_USER_NAME, "method": "TEXT_QUERY_METHOD_EQUALS"}},
            ]
        },
    ).get("result", [])
    if users:
        user_id = users[0]["userId"]
    else:
        user_id = z.call(
            "POST",
            "/v2/users/new",
            {
                "organizationId": org_id,
                "username": SERVICE_USER_NAME,
                "machine": {
                    "name": "LungVisionAI backend",
                    "description": "Creates doctors and patients and assigns their roles",
                },
            },
        )["id"]
    try:
        z.call(
            "POST",
            "/zitadel.internal_permission.v2.InternalPermissionService/CreateAdministrator",
            {"userId": user_id, "resource": {"organizationId": org_id}, "roles": [SERVICE_USER_ROLE]},
        )
    except ZitadelAPIError as err:
        if err.status != 409:
            raise

    if previous_token:
        try:
            Zitadel(previous_token).call("GET", f"/v2/users/{user_id}")
            print(f"service user {SERVICE_USER_NAME}: {user_id} (existing token still valid)")
            return previous_token
        except ZitadelAPIError:
            pass
    token = z.call(
        "POST",
        f"/v2/users/{user_id}/pats",
        {"expirationDate": os.getenv("SERVICE_USER_TOKEN_EXPIRATION", "2099-01-01T00:00:00Z")},
    )["token"]
    print(f"service user {SERVICE_USER_NAME}: {user_id} (new token issued)")
    return token


LOGIN_POLICY_FIELDS = (
    "allowUsernamePassword",
    "allowExternalIdp",
    "passwordlessType",
    "hidePasswordReset",
    "ignoreUnknownUsernames",
    "defaultRedirectUri",
    "passwordCheckLifetime",
    "externalLoginCheckLifetime",
    "mfaInitSkipLifetime",
    "secondFactorCheckLifetime",
    "multiFactorCheckLifetime",
    "allowDomainDiscovery",
    "disableLoginWithEmail",
    "disableLoginWithPhone",
    "forceMfa",
    "forceMfaLocalOnly",
)


def ensure_login_policy(z):
    """Password + SSO, and no Zitadel self-registration: the app has its own sign-up,
    which assigns the doctor role. Accounts registered on Zitadel's page would have none."""
    # instance default: used by login pages without organization context
    policy = z.call("GET", "/admin/v1/policies/login")["policy"]
    if policy.get("allowRegister"):
        settings = {key: policy[key] for key in LOGIN_POLICY_FIELDS if key in policy}
        z.update("PUT", "/admin/v1/policies/login", dict(settings, allowRegister=False))

    # organization: the app always logs in with the organization scope
    policy = z.call("GET", "/management/v1/policies/login")["policy"]
    settings = {
        key: policy[key]
        for key in LOGIN_POLICY_FIELDS + ("secondFactors", "multiFactors")
        if key in policy
    }
    settings.update(allowUsernamePassword=True, allowExternalIdp=True, allowRegister=False)
    if policy.get("isDefault"):
        z.call("POST", "/management/v1/policies/login", settings)
    else:
        z.update("PUT", "/management/v1/policies/login", settings)
    print("login policy: password + SSO, Zitadel self-registration disabled")


def ensure_sso_provider(z):
    issuer = os.getenv("SSO_OIDC_ISSUER")
    if not issuer:
        print("SSO: skipped (SSO_OIDC_ISSUER not set)")
        return
    name = os.getenv("SSO_OIDC_NAME", "SSO")
    provider = {
        "name": name,
        "issuer": issuer,
        "clientId": os.environ["SSO_OIDC_CLIENT_ID"],
        "clientSecret": os.environ["SSO_OIDC_CLIENT_SECRET"],
        "scopes": ["openid", "profile", "email"],
        "isIdTokenMapping": True,
        "usePkce": True,
        "providerOptions": {
            "isLinkingAllowed": True,
            "isCreationAllowed": True,
            "isAutoCreation": True,
            "isAutoUpdate": True,
            # no automatic linking to existing accounts by email: a misconfigured
            # IdP could otherwise take over an existing account
            "autoLinking": "AUTO_LINKING_OPTION_UNSPECIFIED",
        },
    }
    existing = [
        idp
        for idp in z.call(
            "POST",
            "/management/v1/idps/templates/_search",
            {"queries": [{"idpNameQuery": {"name": name, "method": "TEXT_QUERY_METHOD_EQUALS"}}]},
        ).get("result", [])
        if idp.get("owner") == "IDP_OWNER_TYPE_ORG"
    ]
    if existing:
        idp_id = existing[0]["id"]
        z.update("PUT", f"/management/v1/idps/generic_oidc/{idp_id}", provider)
    else:
        idp_id = z.call("POST", "/management/v1/idps/generic_oidc", provider)["id"]
    try:
        z.call(
            "POST",
            "/management/v1/policies/login/idps",
            {"idpId": idp_id, "ownerType": "IDP_OWNER_TYPE_ORG"},
        )
    except ZitadelAPIError as err:
        if err.status != 409:
            raise
    print(f"SSO: {name} ({issuer}) -> callback URL {ISSUER}/idps/callback")


def main():
    admin_token = wait_for_admin_token()
    org_id = Zitadel(admin_token).call("GET", "/management/v1/orgs/me")["org"]["id"]
    z = Zitadel(admin_token, org_id)

    previous = {}
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            previous = json.load(f)

    project_id = ensure_project(z, org_id)
    ensure_roles(z, project_id)
    client_id = ensure_app(z, project_id)
    service_token = ensure_service_user(z, org_id, previous.get("ZITADEL_SERVICE_USER_TOKEN"))
    ensure_login_policy(z)
    ensure_sso_provider(z)

    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    fd = os.open(CONFIG_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(
            {
                "ZITADEL_ORGANIZATION_ID": org_id,
                "ZITADEL_PROJECT_ID": project_id,
                "ZITADEL_CLIENT_ID": client_id,
                "ZITADEL_SERVICE_USER_TOKEN": service_token,
            },
            f,
            indent=2,
        )
    print(f"wrote {CONFIG_FILE}")


if __name__ == "__main__":
    main()
