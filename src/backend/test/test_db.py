import uuid
from datetime import datetime

import pytest
from psycopg_pool import ConnectionPool, PoolTimeout
from runtime.config import Config
from runtime.data.postgres.base_service import create_schema
from runtime.data.postgres.medical_prescription_service import MedicalPrescriptionService
from runtime.data.postgres.medical_record_service import MedicalRecordService

REPORT = {
    "findings": "1. Right upper lobe: consolidation.",
    "impression": "Likely pneumonia.",
    "predictions": [
        {"region": "Right lung", "conditions": [{"condition": "Pneumonia", "confidence": 92.5}]}
    ],
    "segmentationBoxes": [{"label": "Right lung", "x1": 10, "y1": 20, "x2": 110, "y2": 220}],
}


def record_body(**fields):
    body = {
        "xRayUrl": "https://bucket/xray.jpg",
        "note": "Cough for 2 weeks",
        "priority": "Low",
        "report": REPORT,
        "treatmentPlan": "Antibiotics",
    }
    return {**body, **fields}


def prescription_body(**fields):
    body = {"dosage": "500mg", "dosageFrequency": "daily", "dosageDuration": "7 days", "time": "8PM"}
    return {**body, **fields}


@pytest.fixture(scope="module")
def pool():
    """Tables in a throwaway schema of the DATABASE_URL database, dropped afterwards."""
    schema = f"test_{uuid.uuid4().hex}"
    pool = ConnectionPool(
        Config().get("DATABASE_URL"), kwargs={"options": f"-c search_path={schema}"}, open=False
    )
    try:
        pool.open(wait=True, timeout=5)
    except PoolTimeout:
        pool.close()
        pytest.skip("no Postgres reachable at DATABASE_URL")
    with pool.connection() as conn:
        conn.execute(f"CREATE SCHEMA {schema}")
    create_schema(pool)
    yield pool
    with pool.connection() as conn:
        conn.execute(f"DROP SCHEMA {schema} CASCADE")
    pool.close()


@pytest.fixture
def records(pool):
    return MedicalRecordService(pool)


@pytest.fixture
def prescriptions(pool):
    return MedicalPrescriptionService(pool)


def test_schema_can_be_applied_on_every_start(pool):
    create_schema(pool)


def test_record_keeps_api_keys_and_report(records):
    created = records.create_new_record("patient-1", record_body())

    assert created == records.get_record_by_id(created["id"])
    assert set(created) == {
        "id", "userId", "xRayUrl", "note", "priority", "report", "treatmentPlan",
        "prescription", "created_at", "updated_at",
    }
    assert created["userId"] == "patient-1"
    assert created["report"] == REPORT
    assert (created["xRayUrl"], created["treatmentPlan"]) == ("https://bucket/xray.jpg", "Antibiotics")
    assert datetime.fromisoformat(created["created_at"]).tzinfo is not None


def test_update_record(records):
    created = records.create_new_record("patient-1", record_body())

    updated = records.update_record_by_id(
        created["id"], {"xRayUrl": "https://bucket/new.jpg", "note": "Better", "prescription": ["rest"]}
    )

    assert (updated["xRayUrl"], updated["note"], updated["prescription"]) == (
        "https://bucket/new.jpg", "Better", ["rest"]
    )
    assert updated["report"] == REPORT
    assert datetime.fromisoformat(updated["updated_at"]) > datetime.fromisoformat(created["updated_at"])
    assert records.get_record_by_id(created["id"]) == updated


def test_unknown_or_malformed_ids_are_not_found(records):
    update = {"xRayUrl": "", "note": "", "prescription": []}
    assert records.get_record_by_id(str(uuid.uuid4())) is None
    assert records.get_record_by_id("not-a-uuid") is None
    assert records.update_record_by_id(str(uuid.uuid4()), update) is None
    assert records.update_record_by_id("not-a-uuid", update) is None


def test_records_are_paged_newest_first_without_report(records):
    patient = f"patient-{uuid.uuid4()}"
    first, second, third = (records.create_new_record(patient, record_body(note=n)) for n in "abc")
    records.create_new_record("someone-else", record_body())

    page = records.get_paginated_record_by_userId(patient, 2)
    assert [r["id"] for r in page["data"]] == [third["id"], second["id"]]
    assert "report" not in page["data"][0]
    assert page["next"] == second["id"]

    page = records.get_paginated_record_by_userId(patient, 2, page["next"])
    assert [r["id"] for r in page["data"]] == [first["id"]]
    assert page["next"] is None

    assert records.get_paginated_record_by_userId(patient, 2, "not-a-uuid") == {"data": [], "next": None}


def test_prescriptions_of_a_record(records, prescriptions):
    record = records.create_new_record("patient-1", record_body())
    first = prescriptions.create_new_prescription(record["id"], prescription_body())
    second = prescriptions.create_new_prescription(record["id"], prescription_body(dosage="250mg"))

    assert second["recordId"] == record["id"]
    assert (second["dosage"], second["dosageFrequency"], second["time"]) == ("250mg", "daily", "8PM")
    assert prescriptions.get_paginated_prescription_by_recordId(record["id"], 10) == {
        "data": [second, first],
        "next": None,
    }

    updated = prescriptions.update_prescription_by_id(first["id"], prescription_body(dosageDuration="14 days"))
    assert updated["dosageDuration"] == "14 days"
    assert prescriptions.get_prescription_by_id(first["id"]) == updated


def test_prescription_needs_an_existing_record(prescriptions):
    assert prescriptions.create_new_prescription(str(uuid.uuid4()), prescription_body()) is None
    assert prescriptions.create_new_prescription("not-a-uuid", prescription_body()) is None
    assert prescriptions.get_paginated_prescription_by_recordId("not-a-uuid", 10) == {"data": [], "next": None}
