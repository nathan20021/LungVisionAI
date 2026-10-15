import base64
from datetime import datetime, timezone
from urllib.parse import urlparse

import jwt
import requests

from scopes import DOCTOR_SCOPES, PATIENT_SCOPES, is_doctor, is_patient

from ..logger import Logger

logger = Logger().getLogger()

# Profile fields Zitadel has no attribute for are kept as user metadata
METADATA_FIELDS = ("occupation", "organization", "location", "birthdate", "doctor_id")
EDITABLE_METADATA_FIELDS = ("occupation", "organization", "location")
SSO_PROVISIONED_KEY = "sso_provisioned_at"

GENDERS = {"male": "GENDER_MALE", "female": "GENDER_FEMALE", "other": "GENDER_DIVERSE"}
GENDER_NAMES = {value: key for key, value in GENDERS.items()}

SSO_DEFAULT_ROLES = {"doctor": DOCTOR_SCOPES, "patient": PATIENT_SCOPES, "none": ()}

ERROR_CODES = {
    400: "InvalidParameterException",
    401: "NotAuthorizedException",
    403: "AccessDeniedException",
    404: "UserNotFoundException",
    409: "UserAlreadyExists",
}


class ZitadelError(Exception):
    """A failed Zitadel call; str(error) is a short code, message the human readable reason."""

    def __init__(self, code, message="", status=500):
        super().__init__(code)
        self.message = message
        self.status = status


def _b64(value):
    return base64.b64encode(str(value).encode()).decode()


class ZitadelIdentityProvider:
    def __init__(
        self,
        issuer,
        api_url,
        organization_id,
        project_id,
        client_id,
        service_token,
        sso_default_role="doctor",
        sso_idp_id=None,
    ):
        self.issuer = issuer.rstrip("/")
        self.api_url = (api_url or issuer).rstrip("/")
        self.organization_id = organization_id
        self.project_id = project_id
        self.client_id = client_id
        # the SSO identity provider's Zitadel id, None when SSO is not configured
        self.sso_idp_id = sso_idp_id or None
        if sso_default_role not in SSO_DEFAULT_ROLES:
            raise ValueError(
                f"ZITADEL_SSO_DEFAULT_ROLE must be one of {', '.join(SSO_DEFAULT_ROLES)}"
            )
        self.sso_default_scopes = SSO_DEFAULT_ROLES[sso_default_role]
        # Zitadel picks the instance from the Host header, so calls made on an
        # internal address (e.g. http://zitadel:8080) must present the public host
        host_header = {"Host": urlparse(self.issuer).netloc}
        self.session = requests.Session()
        self.session.headers.update(host_header)
        self.session.headers["Authorization"] = f"Bearer {service_token}"
        self.jwks_client = jwt.PyJWKClient(
            f"{self.api_url}/oauth/v2/keys", headers=host_header, timeout=10
        )

    # --- tokens -------------------------------------------------------------

    def verify_access_token(self, access_token):
        """Validate a Zitadel JWT access token and return its claims."""
        signing_key = self.jwks_client.get_signing_key_from_jwt(access_token)
        return jwt.decode(
            access_token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            issuer=self.issuer,
            audience=self.project_id,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )

    def scopes_from_claims(self, claims):
        return set(claims.get(f"urn:zitadel:iam:org:project:{self.project_id}:roles", {}))

    def verify_token(self, token):
        try:
            self.verify_access_token(token)
            return True
        except jwt.PyJWTError:
            return False

    # --- users --------------------------------------------------------------

    def sign_up_doctor(self, user_email, password, user_detail):
        user_id = self._create_human(
            user_email,
            user_detail.get("first_name", ""),
            user_detail.get("last_name", ""),
            password=password,
            metadata={field: user_detail.get(field) for field in EDITABLE_METADATA_FIELDS},
        )
        self._grant_or_delete_user(user_id, DOCTOR_SCOPES)
        return self.get_user_by_id(user_id)

    def create_patient(self, doctor_id, patient_email, patient_detail):
        """
        Args:
            doctor_id (str): The ID of the doctor associated with the patient.
            patient_email (str): The email address of the patient.
            patient_detail["name"] (str):
            patient_detail["gender"] ("male", "female", "other"):
            patient_detail["birthdate"] (str): The birthdate of the patient in the format "YYYY-01-01".
        Returns:
            dict: A dictionary containing information about the newly created user.
        The patient gets no password; they cannot sign in until they set one.
        """
        names = patient_detail.get("name", "").split()
        if not names:
            raise ZitadelError("InvalidParameterException", "Patient name is required", 400)
        # Zitadel requires both names; a single name becomes "<name> -"
        first_name = " ".join(names[:-1]) if len(names) > 1 else names[0]
        last_name = names[-1] if len(names) > 1 else "-"
        user_id = self._create_human(
            patient_email,
            first_name,
            last_name,
            gender=patient_detail.get("gender", "").lower(),
            metadata={
                "doctor_id": doctor_id,
                "birthdate": patient_detail.get("birthdate"),
                "occupation": "Patient",
            },
        )
        self._grant_or_delete_user(user_id, PATIENT_SCOPES)
        return self.get_user_by_id(user_id)

    def get_user_by_id(self, user_id):
        try:
            user = self._call("GET", f"/v2/users/{user_id}")["user"]
        except ZitadelError as err:
            if err.status in (403, 404):
                return None
            raise
        if "human" not in user:
            return None
        return self._user_json(user, self._metadata(user_id), self._scopes_of(user_id))

    def get_patients_by_doctor_id(self, doctor_id):
        patients, offset = [], 0
        while True:
            response = self._call(
                "POST",
                "/v2/users",
                {
                    "query": {"offset": str(offset), "limit": 100},
                    "queries": [
                        {"organizationIdQuery": {"organizationId": self.organization_id}},
                        {"metadataKeyFilter": {"key": "doctor_id", "method": "TEXT_FILTER_METHOD_EQUALS"}},
                        {
                            "metadataValueFilter": {
                                "value": _b64(doctor_id),
                                "method": "BYTE_FILTER_METHOD_EQUALS",
                            }
                        },
                    ],
                },
            )
            users = response.get("result", [])
            for user in users:
                metadata = self._metadata(user["userId"])
                # the key and value filters may match different metadata entries
                if metadata.get("doctor_id") == doctor_id:
                    patients.append(self._user_json(user, metadata))
            offset += len(users)
            if not users or offset >= int(response.get("details", {}).get("totalResult", 0)):
                return patients

    def update_user_by_id(self, user_id, updated_user_json):
        current_user = self.get_user_by_id(user_id)
        if not current_user:
            raise ZitadelError("UserNotFoundException", "User not found", 404)
        profile = {}
        if updated_user_json.get("first_name"):
            profile["givenName"] = updated_user_json["first_name"]
        if updated_user_json.get("last_name"):
            profile["familyName"] = updated_user_json["last_name"]
        if profile:
            self._call("PATCH", f"/v2/users/{user_id}", {"human": {"profile": profile}})
        metadata = [
            {"key": field, "value": _b64(updated_user_json[field])}
            for field in EDITABLE_METADATA_FIELDS
            if updated_user_json.get(field)
        ]
        if metadata:
            self._call("POST", f"/v2/users/{user_id}/metadata", {"metadata": metadata})
        return {
            "updated": "success",
            "userId": user_id,
            "username": current_user["username"],
        }

    def grant_default_sso_scopes(self, user_id, scopes):
        """Give a first-time SSO user the default role. Returns True when scopes were granted.

        Runs once per user: an admin who later removes the role is not overruled.
        """
        if is_doctor(scopes) or is_patient(scopes) or not self.sso_default_scopes:
            return False
        if not self._call("POST", f"/v2/users/{user_id}/links/_search", {}).get("result"):
            return False
        if SSO_PROVISIONED_KEY in self._metadata(user_id):
            return False
        try:
            self._grant(user_id, self.sso_default_scopes)
        except ZitadelError as err:
            if err.status != 409:
                raise
            return False
        self._call(
            "POST",
            f"/v2/users/{user_id}/metadata",
            {"metadata": [{"key": SSO_PROVISIONED_KEY, "value": _b64(datetime.now(timezone.utc).isoformat())}]},
        )
        logger.info("Granted %s to SSO user %s", ", ".join(self.sso_default_scopes), user_id)
        return True

    # --- helpers ------------------------------------------------------------

    def _call(self, method, path, body=None):
        try:
            response = self.session.request(method, self.api_url + path, json=body, timeout=10)
        except requests.RequestException as err:
            logger.error("Couldn't reach Zitadel at %s: %s", self.api_url, err)
            raise ZitadelError("ServiceUnavailable", "Identity provider unavailable", 503)
        if response.ok:
            return response.json() if response.content else {}
        try:
            message = response.json().get("message", "")
        except ValueError:
            message = response.text
        logger.error("Zitadel %s %s failed: %s %s", method, path, response.status_code, message)
        raise ZitadelError(
            ERROR_CODES.get(response.status_code, "ZitadelError"), message, response.status_code
        )

    def _create_human(self, email, first_name, last_name, password=None, gender=None, metadata=None):
        human = {
            "profile": {
                "givenName": first_name,
                "familyName": last_name,
                "gender": GENDERS.get(gender, "GENDER_UNSPECIFIED"),
            },
            # no email verification yet (needs SMTP), same as the Cognito setup
            "email": {"email": email, "isVerified": True},
        }
        if password:
            human["password"] = {"password": password, "changeRequired": False}
        return self._call(
            "POST",
            "/v2/users/new",
            {
                "organizationId": self.organization_id,
                "username": email,
                "human": human,
                "metadata": [
                    {"key": key, "value": _b64(value)} for key, value in (metadata or {}).items() if value
                ],
            },
        )["id"]

    def _grant(self, user_id, scopes):
        self._call(
            "POST",
            "/zitadel.authorization.v2.AuthorizationService/CreateAuthorization",
            {
                "userId": user_id,
                "projectId": self.project_id,
                "organizationId": self.organization_id,
                "roleKeys": list(scopes),
            },
        )

    def _grant_or_delete_user(self, user_id, scopes):
        try:
            self._grant(user_id, scopes)
        except ZitadelError:
            # don't leave a user without a role behind
            self._call("DELETE", f"/v2/users/{user_id}")
            raise

    def _metadata(self, user_id):
        response = self._call("POST", f"/v2/users/{user_id}/metadata/search", {})
        return {
            entry["key"]: base64.b64decode(entry["value"]).decode()
            for entry in response.get("metadata", [])
        }

    def _scopes_of(self, user_id):
        response = self._call(
            "POST",
            "/zitadel.authorization.v2.AuthorizationService/ListAuthorizations",
            {
                "filters": [
                    {"projectId": {"id": self.project_id}},
                    {"inUserIds": {"ids": [user_id]}},
                ]
            },
        )
        return {
            role["key"]
            for authorization in response.get("authorizations", [])
            if authorization.get("state") == "STATE_ACTIVE"
            for role in authorization.get("roles", [])
        }

    def _user_json(self, user, metadata, scopes=None):
        human = user.get("human", {})
        profile = human.get("profile", {})
        details = user.get("details", {})
        user_json = {field: metadata.get(field, "") for field in METADATA_FIELDS}
        user_json.update(
            {
                "id": user["userId"],
                "sub": user["userId"],
                "username": user.get("username", ""),
                "email": human.get("email", {}).get("email", ""),
                "email_verified": human.get("email", {}).get("isVerified", False),
                "phone_number": human.get("phone", {}).get("phone", ""),
                "first_name": profile.get("givenName", ""),
                "last_name": profile.get("familyName", ""),
                "gender": GENDER_NAMES.get(profile.get("gender"), "other"),
                "enabled": user.get("state") == "USER_STATE_ACTIVE",
                "user_status": user.get("state", ""),
                "user_create_date": details.get("creationDate"),
                "user_last_modified_date": details.get("changeDate"),
            }
        )
        if scopes is not None:
            user_json["scopes"] = sorted(scopes)
            user_json["is_doctor"] = is_doctor(scopes)
            user_json["is_patient"] = is_patient(scopes)
        return user_json
