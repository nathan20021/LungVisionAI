import unittest
from unittest import mock

import jwt
import pytest
import requests
import runtime
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import Flask
from runtime import IdentityProvider
from runtime.data.zitadel import ZitadelError, ZitadelIdentityProvider
from scopes import (
    DOCTOR_PATIENTS_READ,
    DOCTOR_RECORDS_WRITE,
    DOCTOR_SCOPES,
    PATIENT_SCOPES,
)

from .mocks.mock_identity_provider import MockIdentityProvider, mint_token

DOCTOR_DETAIL = {
    "first_name": "John",
    "last_name": "Doe",
    "occupation": "Radiologist",
    "organization": "Health Org",
    "location": "City",
}


def sign_up_doctor(email="doctor@example.com"):
    return IdentityProvider.sign_up_doctor(email, "Test-Pass1!", dict(DOCTOR_DETAIL))


def create_patient(doctor_id, email="patient@example.com", name="Nathan T Luong"):
    return IdentityProvider.create_patient(
        doctor_id, email, {"name": name, "gender": "Male", "birthdate": "1980-01-01"}
    )


class TestZitadelTokens(unittest.TestCase):
    def test_valid_token_returns_claims_and_scopes(self):
        claims = IdentityProvider.verify_access_token(mint_token("user-1", DOCTOR_SCOPES))
        assert claims["sub"] == "user-1"
        assert IdentityProvider.scopes_from_claims(claims) == set(DOCTOR_SCOPES)

    def test_rejects_token_for_another_project(self):
        with pytest.raises(jwt.InvalidAudienceError):
            IdentityProvider.verify_access_token(mint_token("user-1", aud=["other-project"]))

    def test_rejects_token_from_another_issuer(self):
        with pytest.raises(jwt.InvalidIssuerError):
            IdentityProvider.verify_access_token(mint_token("user-1", iss="http://evil.test"))

    def test_rejects_expired_token(self):
        with pytest.raises(jwt.ExpiredSignatureError):
            IdentityProvider.verify_access_token(mint_token("user-1", exp=1))

    def test_rejects_token_signed_with_another_key(self):
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with pytest.raises(jwt.InvalidSignatureError):
            IdentityProvider.verify_access_token(mint_token("user-1", key=other_key))

    def test_verify_token_is_false_for_garbage(self):
        assert IdentityProvider.verify_token("not-a-jwt") is False


class TestZitadelUsers(unittest.TestCase):
    def setUp(self):
        IdentityProvider.reset_mock()

    def test_sign_up_doctor_creates_user_with_doctor_scopes(self):
        user = sign_up_doctor()
        assert user["email"] == "doctor@example.com"
        assert user["first_name"] == "John"
        assert user["last_name"] == "Doe"
        assert user["occupation"] == "Radiologist"
        assert user["organization"] == "Health Org"
        assert user["location"] == "City"
        assert user["is_doctor"] is True
        assert user["is_patient"] is False
        assert user["scopes"] == sorted(DOCTOR_SCOPES)
        assert IdentityProvider.api.passwords[user["id"]] == "Test-Pass1!"

    def test_sign_up_doctor_twice_fails(self):
        sign_up_doctor()
        with pytest.raises(ZitadelError) as err:
            sign_up_doctor()
        assert str(err.value) == "UserAlreadyExists"

    def test_create_patient_links_doctor_and_has_no_password(self):
        patient = create_patient("doctor-1")
        assert patient["first_name"] == "Nathan T"
        assert patient["last_name"] == "Luong"
        assert patient["gender"] == "male"
        assert patient["birthdate"] == "1980-01-01"
        assert patient["doctor_id"] == "doctor-1"
        assert patient["is_patient"] is True
        assert patient["is_doctor"] is False
        assert patient["scopes"] == sorted(PATIENT_SCOPES)
        assert IdentityProvider.api.passwords[patient["id"]] is None

    def test_create_patient_with_single_name(self):
        patient = create_patient("doctor-1", name="Cher")
        assert (patient["first_name"], patient["last_name"]) == ("Cher", "-")

    def test_failed_role_grant_removes_the_new_user(self):
        failure = ZitadelError("AccessDeniedException", "denied", 403)
        with mock.patch.object(IdentityProvider, "_grant", side_effect=failure):
            with pytest.raises(ZitadelError):
                sign_up_doctor()
        assert IdentityProvider.api.users == {}

    def test_get_patients_by_doctor_id_only_returns_that_doctors_patients(self):
        create_patient("doctor-1", "a@example.com")
        create_patient("doctor-1", "b@example.com")
        create_patient("doctor-2", "c@example.com")
        # another metadata entry holding doctor-1's id must not count as a link
        IdentityProvider.sign_up_doctor(
            "d@example.com", "Test-Pass1!", dict(DOCTOR_DETAIL, occupation="doctor-1")
        )

        patients = IdentityProvider.get_patients_by_doctor_id("doctor-1")

        assert sorted(p["email"] for p in patients) == ["a@example.com", "b@example.com"]

    def test_get_user_by_id_unknown_returns_none(self):
        assert IdentityProvider.get_user_by_id("missing") is None

    def test_update_user_by_id_cannot_change_roles(self):
        doctor = sign_up_doctor()
        response = IdentityProvider.update_user_by_id(
            doctor["id"], {"first_name": "Jane", "occupation": "Surgeon", "is_doctor": "false"}
        )
        assert response == {"updated": "success", "userId": doctor["id"], "username": "doctor@example.com"}

        user = IdentityProvider.get_user_by_id(doctor["id"])
        assert user["first_name"] == "Jane"
        assert user["last_name"] == "Doe"
        assert user["occupation"] == "Surgeon"
        assert user["is_doctor"] is True


class TestSsoProvisioning(unittest.TestCase):
    def setUp(self):
        IdentityProvider.reset_mock()

    def sso_user(self, provider=IdentityProvider):
        user_id = provider._create_human("sam@hospital.example", "Sam", "Sso")
        provider.api.add_idp_link(user_id)
        return user_id

    def test_first_sso_login_grants_default_scopes_once(self):
        user_id = self.sso_user()

        assert IdentityProvider.grant_default_sso_scopes(user_id, set()) is True
        assert IdentityProvider.get_user_by_id(user_id)["scopes"] == sorted(DOCTOR_SCOPES)

        # an admin removes the role later: it must not come back on the next login
        IdentityProvider.api.authorizations.clear()
        assert IdentityProvider.grant_default_sso_scopes(user_id, set()) is False

    def test_users_without_idp_link_get_nothing(self):
        user_id = IdentityProvider._create_human("local@example.com", "Lo", "Cal")
        assert IdentityProvider.grant_default_sso_scopes(user_id, set()) is False

    def test_users_with_a_role_are_left_alone(self):
        user_id = self.sso_user()
        assert IdentityProvider.grant_default_sso_scopes(user_id, set(PATIENT_SCOPES)) is False

    def test_default_role_none_disables_provisioning(self):
        provider = MockIdentityProvider(sso_default_role="none")
        assert provider.grant_default_sso_scopes(self.sso_user(provider), set()) is False

    def test_unknown_default_role_is_rejected(self):
        with pytest.raises(ValueError):
            MockIdentityProvider(sso_default_role="admin")


class TestZitadelHTTP(unittest.TestCase):
    def setUp(self):
        self.provider = ZitadelIdentityProvider(
            issuer="http://localhost:8080",
            api_url="http://zitadel:8080",
            organization_id="org-1",
            project_id="project-1",
            client_id="client-1",
            service_token="token",
        )

    def test_uses_internal_url_with_public_host_header(self):
        response = mock.Mock(ok=True, content=b"{}", json=lambda: {})
        with mock.patch.object(self.provider.session, "request", return_value=response) as request:
            self.provider._call("GET", "/v2/users/1")
        request.assert_called_once_with("GET", "http://zitadel:8080/v2/users/1", json=None, timeout=10)
        assert self.provider.session.headers["Host"] == "localhost:8080"
        assert self.provider.session.headers["Authorization"] == "Bearer token"

    def test_conflict_maps_to_user_already_exists(self):
        response = mock.Mock(ok=False, status_code=409, json=lambda: {"message": "User already exists"})
        with mock.patch.object(self.provider.session, "request", return_value=response):
            with pytest.raises(ZitadelError) as err:
                self.provider._call("POST", "/v2/users/new", {})
        assert str(err.value) == "UserAlreadyExists"
        assert (err.value.status, err.value.message) == (409, "User already exists")

    def test_unreachable_zitadel_is_service_unavailable(self):
        with mock.patch.object(
            self.provider.session, "request", side_effect=requests.ConnectionError("down")
        ):
            with pytest.raises(ZitadelError) as err:
                self.provider._call("GET", "/v2/users/1")
        assert err.value.status == 503


@pytest.fixture
def client():
    from api.doctor import doctor_bp
    from api.fileHandler import s3_blueprint
    from api.oauth import oauth_bp
    from api.record import record_blueprint
    from api.user import user_blueprint

    IdentityProvider.reset_mock()
    app = Flask(__name__)
    app.register_blueprint(oauth_bp, url_prefix="/oauth")
    app.register_blueprint(user_blueprint, url_prefix="/users")
    app.register_blueprint(record_blueprint, url_prefix="/users/<userId>")
    app.register_blueprint(doctor_bp, url_prefix="/doctors/<doctorId>")
    app.register_blueprint(s3_blueprint)
    return app.test_client()


def auth(user_id, scopes):
    return {"Authorization": f"Bearer {mint_token(user_id, scopes)}"}


class TestScopeSeparation:
    def test_requests_without_token_are_unauthenticated(self, client):
        assert client.get("/doctors/doc-1/patients").status_code == 401
        assert client.get("/users/someone").status_code == 401

    def test_invalid_token_is_unauthenticated(self, client):
        response = client.get("/doctors/doc-1/patients", headers={"Authorization": "Bearer nope"})
        assert response.status_code == 401

    def test_doctor_lists_own_patients(self, client):
        doctor = sign_up_doctor()
        create_patient(doctor["id"])
        response = client.get(f"/doctors/{doctor['id']}/patients", headers=auth(doctor["id"], DOCTOR_SCOPES))
        assert response.status_code == 200
        assert [p["email"] for p in response.get_json()] == ["patient@example.com"]

    def test_doctor_cannot_list_another_doctors_patients(self, client):
        response = client.get("/doctors/doc-2/patients", headers=auth("doc-1", DOCTOR_SCOPES))
        assert response.status_code == 403

    def test_patient_scopes_do_not_open_doctor_routes(self, client):
        response = client.get("/doctors/pat-1/patients", headers=auth("pat-1", PATIENT_SCOPES))
        assert response.status_code == 403
        assert response.get_json()["missing_scopes"] == [DOCTOR_PATIENTS_READ]

    def test_creating_patients_needs_the_write_scope(self, client):
        response = client.post(
            "/doctors/doc-1/patient",
            json={"email": "p@example.com", "name": "Pat Ient"},
            headers=auth("doc-1", [DOCTOR_PATIENTS_READ]),
        )
        assert response.status_code == 403

    def test_doctor_creates_patient(self, client):
        response = client.post(
            "/doctors/doc-1/patient",
            json={"email": "p@example.com", "name": "Pat Ient", "gender": "female", "birthdate": "1990-01-01"},
            headers=auth("doc-1", DOCTOR_SCOPES),
        )
        assert response.status_code == 200
        assert response.get_json()["doctor_id"] == "doc-1"

    def test_patient_profile_access(self, client):
        doctor = sign_up_doctor()
        patient = create_patient(doctor["id"])
        other = create_patient(doctor["id"], "other@example.com")
        path = f"/users/{patient['id']}"

        assert client.get(path, headers=auth(doctor["id"], DOCTOR_SCOPES)).status_code == 200
        assert client.get(path, headers=auth("doc-2", DOCTOR_SCOPES)).status_code == 404
        assert client.get(path, headers=auth(patient["id"], PATIENT_SCOPES)).status_code == 200
        assert client.get(path, headers=auth(other["id"], PATIENT_SCOPES)).status_code == 403
        assert client.post(path, json={}, headers=auth(patient["id"], PATIENT_SCOPES)).status_code == 403

    def test_patient_reads_only_own_records(self, client):
        runtime.MedicalRecordService.get_paginated_record_by_userId.return_value = {"data": [], "next": None}
        runtime.MedicalRecordService.get_record_by_id.return_value = {"id": "rec-1", "userId": "pat-2"}
        runtime.MedicalPrescriptionService.get_paginated_prescription_by_recordId.return_value = {"data": []}
        patient = auth("pat-1", PATIENT_SCOPES)

        assert client.get("/users/pat-1/records", headers=patient).status_code == 200
        assert client.get("/users/pat-2/records", headers=patient).status_code == 403
        # record rec-1 belongs to pat-2, even when requested through pat-1's path
        assert client.get("/users/pat-1/records/rec-1", headers=patient).status_code == 404
        assert client.get("/users/pat-1/records/rec-1", headers=auth("doc-1", DOCTOR_SCOPES)).status_code == 200
        assert client.post("/users/pat-1/record", json={}, headers=patient).status_code == 403

    def test_self_grants_default_scopes_on_first_sso_login(self, client):
        user_id = IdentityProvider._create_human("sam@hospital.example", "Sam", "Sso")
        IdentityProvider.api.add_idp_link(user_id)

        response = client.get("/oauth/self", headers=auth(user_id, []))

        assert response.status_code == 200
        body = response.get_json()
        assert body["token_refresh_required"] is True
        assert body["is_doctor"] is True

    def test_sign_up_requires_names_and_password(self, client):
        response = client.post("/oauth/sign_up", json={"email": "d@example.com"})
        assert response.status_code == 400

    def test_sign_up_creates_doctor(self, client):
        response = client.post(
            "/oauth/sign_up",
            json=dict(DOCTOR_DETAIL, email="d@example.com", password="Test-Pass1!"),
        )
        assert response.status_code == 200
        assert response.get_json()["is_doctor"] is True

    def test_auth_config_scopes_login_to_the_organization(self, client):
        body = client.get("/oauth/config").get_json()
        assert body["client_id"] == IdentityProvider.client_id
        assert body["authority"] == IdentityProvider.issuer
        assert f"urn:zitadel:iam:org:id:{IdentityProvider.organization_id}" in body["scope"].split()
        assert body["sso_idp_id"] is None

    def test_auth_config_names_the_sso_provider(self, client, monkeypatch):
        monkeypatch.setattr(IdentityProvider, "sso_idp_id", "idp-1")
        assert client.get("/oauth/config").get_json()["sso_idp_id"] == "idp-1"


def test_each_upload_gets_its_own_key(client):
    runtime.S3PresignedURLHandler.generate_upload_url.side_effect = lambda key: f"https://bucket/{key}"
    headers = auth("doc-1", [DOCTOR_RECORDS_WRITE])

    first, second = (
        client.get("/generate-upload-url/xray.jpg", headers=headers).get_json() for _ in range(2)
    )

    assert first != second
    assert first.endswith("-xray.jpg") and second.endswith("-xray.jpg")
