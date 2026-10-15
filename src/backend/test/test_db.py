import uuid
from datetime import datetime

import pytest
from psycopg_pool import ConnectionPool, PoolTimeout
from runtime.config import Config
from runtime.data.postgres.base_service import create_schema
from runtime.data.postgres import medical_prescription_service
from runtime.data.postgres.medical_prescription_service import MedicalPrescriptionService
from runtime.data.postgres.medical_record_service import (
    MedicalRecordService,
    corrected_report,
    fix_region_names,
)
from runtime.data.postgres.medications import MEDICATIONS

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
    body = {
        "medicationId": None, "dosage": "500mg", "dosageFrequency": "daily",
        "dosageDuration": "7 days", "time": "8PM",
    }
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
    MedicalPrescriptionService(pool).seed_medications()
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


def test_medications_are_seeded_once_by_category(prescriptions):
    medications = prescriptions.get_medications()
    prescriptions.seed_medications()

    assert prescriptions.get_medications() == medications
    assert [m["category"] for m in medications] == sorted(m["category"] for m in medications)
    assert {m["name"]: m["category"] for m in medications} == {
        name: category for category, names in MEDICATIONS.items() for name in names
    }


def medication_id(prescriptions, name):
    return next(m["id"] for m in prescriptions.get_medications() if m["name"] == name)


@pytest.fixture
def amoxicillin(prescriptions):
    return medication_id(prescriptions, "Amoxicillin")


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


def test_update_record_keeps_fields_left_out(records):
    created = records.create_new_record("patient-1", record_body())
    report = {**REPORT, "impression": "Edited by the physician."}

    updated = records.update_record_by_id(
        created["id"], {"note": "", "priority": "High", "treatmentPlan": "Rest", "report": report}
    )

    assert (updated["note"], updated["priority"], updated["treatmentPlan"]) == ("", "High", "Rest")
    assert updated["report"] == report
    assert updated["xRayUrl"] == created["xRayUrl"]


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


def test_prescriptions_of_a_record(records, prescriptions, amoxicillin):
    record = records.create_new_record("patient-1", record_body())
    first = prescriptions.create_new_prescription(record["id"], prescription_body(medicationId=amoxicillin))
    second = prescriptions.create_new_prescription(
        record["id"], prescription_body(medicationId=amoxicillin, dosage="250mg")
    )

    assert second["recordId"] == record["id"]
    assert (second["medication"], second["dosage"], second["dosageFrequency"], second["time"]) == (
        "Amoxicillin", "250mg", "daily", "8PM"
    )
    assert prescriptions.get_paginated_prescription_by_recordId(record["id"], 10) == {
        "data": [second, first],
        "next": None,
    }

    updated = prescriptions.update_prescription_by_id(
        record["id"], first["id"], prescription_body(dosageDuration="14 days")
    )
    assert updated["dosageDuration"] == "14 days"
    assert prescriptions.get_prescription_by_id(record["id"], first["id"]) == updated


def test_prescription_needs_an_existing_record(prescriptions, amoxicillin):
    body = prescription_body(medicationId=amoxicillin)
    assert prescriptions.create_new_prescription(str(uuid.uuid4()), body) is None
    assert prescriptions.create_new_prescription("not-a-uuid", body) is None
    assert prescriptions.get_paginated_prescription_by_recordId("not-a-uuid", 10) == {"data": [], "next": None}


def test_prescription_is_reached_only_through_its_record(records, prescriptions, amoxicillin):
    record = records.create_new_record("patient-1", record_body())
    other = records.create_new_record("patient-2", record_body())
    prescription = prescriptions.create_new_prescription(record["id"], prescription_body(medicationId=amoxicillin))

    assert prescriptions.get_prescription_by_id(other["id"], prescription["id"]) is None
    assert prescriptions.update_prescription_by_id(other["id"], prescription["id"], prescription_body()) is None
    assert prescriptions.delete_prescription_by_id(other["id"], prescription["id"]) is None
    assert prescriptions.get_prescription_by_id(record["id"], prescription["id"]) == prescription

    assert prescriptions.delete_prescription_by_id(record["id"], prescription["id"]) == prescription
    assert prescriptions.get_prescription_by_id(record["id"], prescription["id"]) is None
    assert prescriptions.delete_prescription_by_id(record["id"], "not-a-uuid") is None


def test_prescription_medication_can_change_but_not_be_removed(records, prescriptions, amoxicillin):
    record = records.create_new_record("patient-1", record_body())
    created = prescriptions.create_new_prescription(record["id"], prescription_body(medicationId=amoxicillin))
    assert (created["medicationId"], created["medication"]) == (amoxicillin, "Amoxicillin")

    doxycycline = medication_id(prescriptions, "Doxycycline")
    updated = prescriptions.update_prescription_by_id(
        record["id"], created["id"], prescription_body(medicationId=doxycycline)
    )
    assert (updated["medicationId"], updated["medication"]) == (doxycycline, "Doxycycline")

    kept = prescriptions.update_prescription_by_id(record["id"], created["id"], prescription_body())
    assert (kept["medicationId"], kept["medication"]) == (doxycycline, "Doxycycline")


def test_prescription_needs_a_known_medication(records, prescriptions):
    record = records.create_new_record("patient-1", record_body())
    for unknown in (None, str(uuid.uuid4()), "not-a-uuid"):
        assert prescriptions.create_new_prescription(record["id"], prescription_body(medicationId=unknown)) is None


def test_prescription_written_before_the_medication_list_stays_editable(pool, records, prescriptions):
    record = records.create_new_record("patient-1", record_body())
    with pool.connection() as conn:
        (legacy_id,) = conn.execute(
            "INSERT INTO medical_prescriptions (record_id, dosage) VALUES (%s, '1 g') RETURNING id::text",
            (record["id"],),
        ).fetchone()

    updated = prescriptions.update_prescription_by_id(record["id"], legacy_id, prescription_body(dosage="2 g"))
    assert (updated["medicationId"], updated["medication"], updated["dosage"]) == (None, None, "2 g")


def test_medications_left_out_of_the_list_are_deactivated(monkeypatch, records, prescriptions, amoxicillin):
    record = records.create_new_record("patient-1", record_body())
    created = prescriptions.create_new_prescription(record["id"], prescription_body(medicationId=amoxicillin))
    doxycycline = medication_id(prescriptions, "Doxycycline")
    monkeypatch.setattr(
        medical_prescription_service, "MEDICATIONS", {"Antibiotics": ["Doxycycline"]}
    )
    prescriptions.seed_medications()

    try:
        assert [m["name"] for m in prescriptions.get_medications()] == ["Doxycycline"]
        # existing prescriptions keep a deactivated medication, new ones cannot use it
        assert prescriptions.get_prescription_by_id(record["id"], created["id"])["medication"] == "Amoxicillin"
        assert prescriptions.update_prescription_by_id(
            record["id"], created["id"], prescription_body(medicationId=amoxicillin)
        )["medication"] == "Amoxicillin"
        assert prescriptions.create_new_prescription(
            record["id"], prescription_body(medicationId=amoxicillin)
        ) is None
        other = prescriptions.create_new_prescription(record["id"], prescription_body(medicationId=doxycycline))
        assert prescriptions.update_prescription_by_id(
            record["id"], other["id"], prescription_body(medicationId=amoxicillin)
        ) is None
    finally:
        monkeypatch.undo()
        prescriptions.seed_medications()

    assert medication_id(prescriptions, "Amoxicillin") == amoxicillin


def test_record_is_created_with_its_prescriptions(records, prescriptions, amoxicillin):
    created = records.create_new_record(
        "patient-1",
        record_body(),
        [prescription_body(medicationId=amoxicillin), prescription_body(medicationId=amoxicillin, dosage="1g")],
    )

    saved = prescriptions.get_paginated_prescription_by_recordId(created["id"], 10)["data"]
    # newest first: the order they were given in, reversed
    assert [p["dosage"] for p in saved] == ["1g", "500mg"]
    assert {p["medication"] for p in saved} == {"Amoxicillin"}


def test_record_is_not_created_when_a_prescription_has_no_active_medication(
    monkeypatch, pool, records, amoxicillin
):
    patient = f"patient-{uuid.uuid4()}"
    for medication in (None, str(uuid.uuid4()), "not-a-uuid"):
        bodies = [prescription_body(medicationId=amoxicillin), prescription_body(medicationId=medication)]
        assert records.create_new_record(patient, record_body(), bodies) is None

    monkeypatch.setattr(medical_prescription_service, "MEDICATIONS", {"Antibiotics": ["Doxycycline"]})
    MedicalPrescriptionService(pool).seed_medications()
    try:
        assert records.create_new_record(patient, record_body(), [prescription_body(medicationId=amoxicillin)]) is None
    finally:
        monkeypatch.undo()
        MedicalPrescriptionService(pool).seed_medications()

    assert records.get_paginated_record_by_userId(patient, 10)["data"] == []


def test_corrected_report_renames_old_region_names():
    report = {
        "impression": "Text stays as written.",
        "predictions": [{"region": "right upper lung zone", "conditions": []}],
        "segmentationBoxes": [{"label": "left upper lung zone", "x1": 0.1}],
    }

    fixed = corrected_report(report)

    assert fixed["predictions"][0]["region"] == "cardiac silhouette"
    assert fixed["segmentationBoxes"][0]["label"] == "right apical zone"
    assert fixed["impression"] == "Text stays as written."
    assert fixed["regionNamesCorrected"] is True
    assert corrected_report({"impression": "No regions."}) is None


def test_region_names_are_fixed_once(records, pool):
    old = records.create_new_record("patient-1", record_body(report={
        "predictions": [{"region": "cardiac silhouette", "conditions": []}],
        "segmentationBoxes": [{"label": "cardiac silhouette"}],
    }))

    assert fix_region_names(pool) >= 1
    fixed = records.get_record_by_id(old["id"])["report"]
    assert fixed["predictions"][0]["region"] == "right upper lung zone"
    assert fixed["segmentationBoxes"][0]["label"] == "right upper lung zone"

    # later starts leave every record alone, including ones saved after the fix
    new = records.create_new_record("patient-1", record_body())
    assert fix_region_names(pool) == 0
    assert records.get_record_by_id(old["id"])["report"] == fixed
    assert records.get_record_by_id(new["id"])["report"] == REPORT
