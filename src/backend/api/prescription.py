from decorators.login_required import requires_scopes
from flask import Blueprint, abort, jsonify, request
from runtime import MedicalPrescriptionService
from scopes import DOCTOR_RECORDS_READ, DOCTOR_RECORDS_WRITE

prescription_blueprint = Blueprint("record_prescription", __name__)
medication_blueprint = Blueprint("medication", __name__)


def parse_prescription(body):
    """The prescription fields of a JSON object, or None unless each is a string or null."""
    if not isinstance(body, dict):
        return None
    prescription = {
        # "" or a missing medication counts as none
        "medicationId": body.get("medicationId") or None,
        "dosage": body.get("dosage", ""),
        "dosageFrequency": body.get("dosageFrequency", ""),
        "dosageDuration": body.get("dosageDuration", ""),
        "time": body.get("time", ""),
    }
    if not all(value is None or isinstance(value, str) for value in prescription.values()):
        return None
    return prescription


def prescription_from_request():
    """The prescription in the request body. Aborts with 400 unless it is a JSON object of strings."""
    prescription = parse_prescription(request.get_json(silent=True))
    if prescription is None:
        abort(400, "A prescription must be a JSON object whose fields are strings.")
    return prescription


@medication_blueprint.route("/medications", methods=["GET"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def get_medications():
    return (
        jsonify(MedicalPrescriptionService.get_medications()),
        200,
    )


@prescription_blueprint.route("/prescriptions", methods=["GET"])
@requires_scopes(DOCTOR_RECORDS_READ)
def paginated_prescriptions_by_record_id(userId, recordId):
    limit = request.args.get("limit", default=10, type=int)
    cursor = request.args.get("cursor", default=None, type=str)
    if cursor == "null":
        cursor = None

    prescriptions = MedicalPrescriptionService.get_paginated_prescription_by_recordId(
        recordId, limit, cursor
    )
    return (
        jsonify(prescriptions),
        200,
    )


@prescription_blueprint.route("/prescriptions/<prescriptionId>", methods=["GET"])
@requires_scopes(DOCTOR_RECORDS_READ)
def get_prescription_by_id(userId, recordId, prescriptionId):
    prescription = MedicalPrescriptionService.get_prescription_by_id(recordId, prescriptionId)
    if not prescription:
        return (
            jsonify({}),
            404,
        )
    return (
        jsonify(prescription),
        200,
    )


@prescription_blueprint.route("/prescriptions/<prescriptionId>", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def update_prescription_by_id(userId, recordId, prescriptionId):
    prescription = prescription_from_request()
    updated_prescription = MedicalPrescriptionService.update_prescription_by_id(
        recordId, prescriptionId, prescription
    )
    if not updated_prescription:
        return (
            jsonify({"message": "This record has no such prescription, or the medication cannot be prescribed."}),
            404,
        )
    return (
        jsonify(updated_prescription),
        200,
    )


@prescription_blueprint.route("/prescriptions/<prescriptionId>", methods=["DELETE"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def delete_prescription_by_id(userId, recordId, prescriptionId):
    deleted = MedicalPrescriptionService.delete_prescription_by_id(recordId, prescriptionId)
    if not deleted:
        return (
            jsonify({}),
            404,
        )
    return (
        jsonify(deleted),
        200,
    )


@prescription_blueprint.route("/prescription", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def create_new_prescription_for_record_id(userId, recordId):
    prescription = prescription_from_request()
    if not prescription["medicationId"]:
        return (
            jsonify({"message": "A prescription needs a medication."}),
            400,
        )
    new_pre = MedicalPrescriptionService.create_new_prescription(recordId, prescription)
    if not new_pre:
        return (
            jsonify({"message": "Unknown record, or the medication cannot be prescribed."}),
            400,
        )
    return (
        jsonify(new_pre),
        200,
    )


