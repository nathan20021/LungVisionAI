import itertools
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from runtime.data.zitadel import ZitadelError, ZitadelIdentityProvider

ISSUER = "http://zitadel.test"
ORGANIZATION_ID = "org-1"
PROJECT_ID = "project-1"
CLIENT_ID = "client-1"

SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def mint_token(sub, scopes=(), key=SIGNING_KEY, **claims):
    """A Zitadel-style access token for `sub` holding `scopes` as project roles."""
    now = int(time.time())
    payload = {
        "iss": ISSUER,
        "aud": [CLIENT_ID, PROJECT_ID],
        "sub": sub,
        "iat": now,
        "exp": now + 300,
        f"urn:zitadel:iam:org:project:{PROJECT_ID}:roles": {
            scope: {ORGANIZATION_ID: "lungvisionai.localhost"} for scope in scopes
        },
    }
    payload.update(claims)
    return jwt.encode(payload, key, algorithm="RS256")


class StaticJWKClient:
    """Stands in for jwt.PyJWKClient and always returns the test signing key."""

    class SigningKey:
        key = SIGNING_KEY.public_key()
        algorithm_name = "RS256"

    def get_signing_key_from_jwt(self, token):
        return self.SigningKey()


class FakeZitadelAPI:
    """In-memory subset of the Zitadel API used by ZitadelIdentityProvider."""

    def __init__(self):
        self.ids = itertools.count(1000)
        self.users = {}
        self.passwords = {}
        self.metadata = {}
        self.authorizations = {}
        self.links = {}

    def add_idp_link(self, user_id, idp_id="idp-1"):
        self.links.setdefault(user_id, []).append({"idpId": idp_id, "userId": user_id})

    def handle(self, method, path, body):
        if path == "/v2/users/new":
            return self._create_user(body)
        if path == "/v2/users":
            return self._list_users(body)
        if path.startswith("/zitadel.authorization.v2.AuthorizationService/"):
            return getattr(self, "_" + path.rsplit("/", 1)[1])(body)

        user_id, _, action = path[len("/v2/users/"):].partition("/")
        if user_id not in self.users:
            raise ZitadelError("UserNotFoundException", "User could not be found", 404)
        if not action and method == "GET":
            return {"user": self.users[user_id]}
        if not action and method == "PATCH":
            self.users[user_id]["human"]["profile"].update(body["human"]["profile"])
            return {}
        if not action and method == "DELETE":
            del self.users[user_id]
            return {}
        if action == "metadata":
            for entry in body["metadata"]:
                self.metadata[user_id][entry["key"]] = entry["value"]
            return {}
        if action == "metadata/search":
            return {
                "metadata": [
                    {"key": key, "value": value} for key, value in self.metadata[user_id].items()
                ]
            }
        if action == "links/_search":
            links = self.links.get(user_id, [])
            return {"result": links} if links else {"details": {}}
        raise NotImplementedError(f"{method} {path}")

    def _create_user(self, body):
        if any(user["username"] == body["username"] for user in self.users.values()):
            raise ZitadelError("UserAlreadyExists", "User already exists", 409)
        human = body["human"]
        if not human["profile"].get("givenName") or not human["profile"].get("familyName"):
            raise ZitadelError("InvalidParameterException", "GivenName and FamilyName are required", 400)
        user_id = str(next(self.ids))
        self.users[user_id] = {
            "userId": user_id,
            "username": body["username"],
            "state": "USER_STATE_ACTIVE",
            "details": {"creationDate": "2026-01-01T00:00:00Z", "changeDate": "2026-01-01T00:00:00Z"},
            "human": {"profile": dict(human["profile"]), "email": dict(human["email"])},
        }
        self.passwords[user_id] = human.get("password", {}).get("password")
        self.metadata[user_id] = {entry["key"]: entry["value"] for entry in body.get("metadata", [])}
        return {"id": user_id}

    def _list_users(self, body):
        def matches(user_id, query):
            if "organizationIdQuery" in query:
                return True
            if "metadataKeyFilter" in query:
                return query["metadataKeyFilter"]["key"] in self.metadata[user_id]
            if "metadataValueFilter" in query:
                return query["metadataValueFilter"]["value"] in self.metadata[user_id].values()
            raise NotImplementedError(query)

        found = [
            self.users[user_id]
            for user_id in self.users
            if all(matches(user_id, query) for query in body.get("queries", []))
        ]
        offset = int(body.get("query", {}).get("offset", 0))
        limit = body.get("query", {}).get("limit", 100)
        return {
            "details": {"totalResult": str(len(found))},
            "result": found[offset:offset + limit],
        }

    def _CreateAuthorization(self, body):
        key = (body["userId"], body["projectId"])
        if key in self.authorizations:
            raise ZitadelError("UserAlreadyExists", "User grant already exists", 409)
        self.authorizations[key] = list(body["roleKeys"])
        return {"id": str(next(self.ids))}

    def _ListAuthorizations(self, body):
        filters = {name: value for f in body["filters"] for name, value in f.items()}
        return {
            "authorizations": [
                {
                    "user": {"id": user_id},
                    "state": "STATE_ACTIVE",
                    "roles": [{"key": role} for role in roles],
                }
                for (user_id, project_id), roles in self.authorizations.items()
                if project_id == filters["projectId"]["id"]
                and user_id in filters["inUserIds"]["ids"]
            ]
        }


class MockIdentityProvider(ZitadelIdentityProvider):
    def __init__(self, **kwargs):
        super().__init__(
            issuer=ISSUER,
            api_url=None,
            organization_id=ORGANIZATION_ID,
            project_id=PROJECT_ID,
            client_id=CLIENT_ID,
            service_token="test-service-token",
            **kwargs,
        )
        self.jwks_client = StaticJWKClient()
        self.api = FakeZitadelAPI()

    def _call(self, method, path, body=None):
        return self.api.handle(method, path, body or {})

    def reset_mock(self):
        self.api = FakeZitadelAPI()
