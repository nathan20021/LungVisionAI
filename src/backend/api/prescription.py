from decorators.login_required import requires_scopes
from flask import Blueprint, jsonify, request
from runtime import MedicalPrescriptionService
from scopes import DOCTOR_RECORDS_READ, DOCTOR_RECORDS_WRITE

prescription_blueprint = Blueprint("record_prescription", __name__)


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
    prescription = MedicalPrescriptionService.get_prescription_by_id(prescriptionId)
    return (
        jsonify(prescription),
        200,
    )


@prescription_blueprint.route("/prescriptions/<prescriptionId>", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def update_prescription_by_id(userId, recordId, prescriptionId):
    prescription = {
        "dosage": request.json.get("dosage", ""),
        "dosageFrequency": request.json.get("dosageFrequency", ""),
        "dosageDuration": request.json.get("dosageDuration", ""),
        "time": request.json.get("time", ""),
    }
    updated_prescription = MedicalPrescriptionService.update_prescription_by_id(
        prescriptionId, prescription
    )
    return (
        jsonify(updated_prescription),
        200,
    )


@prescription_blueprint.route("/prescription", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def create_new_prescription_for_record_id(userId, recordId):
    prescription = {
        "dosage": request.json.get("dosage", ""),
        "dosageFrequency": request.json.get("dosageFrequency", ""),
        "dosageDuration": request.json.get("dosageDuration", ""),
        "time": request.json.get("time", ""),
    }
    new_pre = MedicalPrescriptionService.create_new_prescription(recordId, prescription)
    return (
        jsonify(new_pre),
        200,
    )


