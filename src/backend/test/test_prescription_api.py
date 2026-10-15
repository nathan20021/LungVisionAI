import pytest
import runtime
from flask import Flask
from scopes import DOCTOR_SCOPES

from .mocks.mock_identity_provider import mint_token

DOCTOR = {"Authorization": f"Bearer {mint_token('doc-1', DOCTOR_SCOPES)}"}
PATH = "/users/pat-1/records/rec-1"
SAVED = {"id": "rx-1", "recordId": "rec-1", "medicationId": "med-1", "medication": "Amoxicillin"}


@pytest.fixture
def client():
    from api.prescription import medication_blueprint, prescription_blueprint
    from api.record import record_blueprint

    runtime.MedicalPrescriptionService.reset_mock(return_value=True)
    runtime.MedicalRecordService.reset_mock(return_value=True)
    app = Flask(__name__)
    app.register_blueprint(prescription_blueprint, url_prefix="/users/<userId>/records/<recordId>")
    app.register_blueprint(record_blueprint, url_prefix="/users/<userId>")
    app.register_blueprint(medication_blueprint)
    return app.test_client()


def test_medications_are_listed_for_doctors(client):
    runtime.MedicalPrescriptionService.get_medications.return_value = [
        {"id": "med-1", "name": "Amoxicillin", "category": "Antibiotics"}
    ]
    assert client.get("/medications").status_code == 401
    assert client.get("/medications", headers=DOCTOR).get_json()[0]["name"] == "Amoxicillin"


def test_create_needs_a_medication(client):
    create = runtime.MedicalPrescriptionService.create_new_prescription
    for body in ({"dosage": "1 g"}, {"medicationId": "", "dosage": "1 g"}):
        assert client.post(f"{PATH}/prescription", json=body, headers=DOCTOR).status_code == 400
    create.assert_not_called()

    create.return_value = SAVED
    response = client.post(f"{PATH}/prescription", json={"medicationId": "med-1"}, headers=DOCTOR)
    assert (response.status_code, response.get_json()) == (200, SAVED)
    # no frequency is made up for a prescription that left it out
    create.assert_called_once_with(
        "rec-1",
        {"medicationId": "med-1", "dosage": "", "dosageFrequency": "", "dosageDuration": "", "time": ""},
    )


@pytest.mark.parametrize("body", [{"medicationId": 5}, {"medicationId": "med-1", "dosage": {}}, ["med-1"]])
def test_fields_that_are_not_strings_are_refused(client, body):
    response = client.post(f"{PATH}/prescription", json=body, headers=DOCTOR)
    assert response.status_code == 400
    runtime.MedicalPrescriptionService.create_new_prescription.assert_not_called()


def test_writes_postgres_refuses_are_errors_not_null(client):
    service = runtime.MedicalPrescriptionService
    service.create_new_prescription.return_value = None
    service.update_prescription_by_id.return_value = None
    service.get_prescription_by_id.return_value = None
    body = {"medicationId": "med-1", "dosage": "1 g"}

    assert client.post(f"{PATH}/prescription", json=body, headers=DOCTOR).status_code == 400
    assert client.post(f"{PATH}/prescriptions/rx-1", json=body, headers=DOCTOR).status_code == 404
    assert client.get(f"{PATH}/prescriptions/rx-1", headers=DOCTOR).status_code == 404


def test_prescriptions_are_reached_through_their_record(client):
    service = runtime.MedicalPrescriptionService
    service.update_prescription_by_id.return_value = SAVED
    service.get_prescription_by_id.return_value = SAVED

    assert client.post(f"{PATH}/prescriptions/rx-1", json={"dosage": "2 g"}, headers=DOCTOR).status_code == 200
    service.update_prescription_by_id.assert_called_once_with(
        "rec-1", "rx-1",
        {"medicationId": None, "dosage": "2 g", "dosageFrequency": "", "dosageDuration": "", "time": ""},
    )
    assert client.get(f"{PATH}/prescriptions/rx-1", headers=DOCTOR).status_code == 200
    service.get_prescription_by_id.assert_called_once_with("rec-1", "rx-1")


def test_record_is_created_only_with_valid_prescriptions(client):
    create = runtime.MedicalRecordService.create_new_record
    record = {"xRayUrl": "x", "note": "", "priority": "Low", "report": {}, "treatmentPlan": ""}
    for prescriptions in ([{"dosage": "1 g"}], [{"medicationId": 5}], ["med-1"], {"medicationId": "med-1"}):
        response = client.post("/users/pat-1/record", json={**record, "prescriptions": prescriptions}, headers=DOCTOR)
        assert response.status_code == 400
    create.assert_not_called()

    create.return_value = None
    body = {**record, "prescriptions": [{"medicationId": "med-1", "dosage": "1 g"}]}
    assert client.post("/users/pat-1/record", json=body, headers=DOCTOR).status_code == 400

    create.return_value = {"id": "rec-1"}
    assert client.post("/users/pat-1/record", json=body, headers=DOCTOR).status_code == 200
    assert create.call_args.args[2] == [
        {"medicationId": "med-1", "dosage": "1 g", "dosageFrequency": "", "dosageDuration": "", "time": ""}
    ]
