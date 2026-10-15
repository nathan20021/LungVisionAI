from decorators.login_required import requires_doctor_or_own_patient_scope, requires_scopes
from flask import Blueprint, g, jsonify, request
from runtime import MedicalRecordService, MedicalPrescriptionService
from runtime import ReportGenerationService, PredictionService
from scopes import DOCTOR_RECORDS_READ, DOCTOR_RECORDS_WRITE, PATIENT_RECORDS_READ

record_blueprint = Blueprint("record", __name__)

PRESCRIPTION_FIELDS = ("dosage", "dosageFrequency", "dosageDuration", "time")


@record_blueprint.route("/records", methods=["GET"])
@requires_doctor_or_own_patient_scope(DOCTOR_RECORDS_READ, PATIENT_RECORDS_READ)
def paginated_records_by_userId(userId):
    limit = request.args.get("limit", default=10, type=int)
    cursor = request.args.get("cursor", default=None, type=str)
    if cursor == "null":
        cursor = None

    records = MedicalRecordService.get_paginated_record_by_userId(userId, limit, cursor)
    return (
        jsonify(records),
        200,
    )


@record_blueprint.route("/records/<recordId>", methods=["GET"])
@requires_doctor_or_own_patient_scope(DOCTOR_RECORDS_READ, PATIENT_RECORDS_READ)
def get_record_by_id(userId, recordId):
    record = MedicalRecordService.get_record_by_id(recordId)
    # patients only see records that belong to them
    if not record or (
        not g.auth.has_scope(DOCTOR_RECORDS_READ) and record.get("userId") != g.auth.user_id
    ):
        return (
            jsonify({}),
            404,
        )
    prescriptions = (
        MedicalPrescriptionService.get_paginated_prescription_by_recordId(
            recordId, 10
        )
    )
    record["prescriptions"] = prescriptions
    return (
        jsonify(record),
        200,
    )


@record_blueprint.route("/records/<recordId>", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def update_record_by_id(userId, recordId):
    # fields left out of the body keep their stored value
    fields = ("xRayUrl", "note", "priority", "treatmentPlan", "report", "prescription")
    record = {field: request.json.get(field) for field in fields}
    updated_record = MedicalRecordService.update_record_by_id(recordId, record)
    if not updated_record:
        return (
            jsonify({}),
            404,
        )
    return (
        jsonify(updated_record),
        200,
    )


@record_blueprint.route("/record", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def create_new_record(userId):
    record_info = {
        "xRayUrl": request.json.get("xRayUrl", ""),
        "note": request.json.get("note", ""),
        "priority": request.json.get("priority", ""),
        "report": request.json.get("report", ""),
        "treatmentPlan": request.json.get("treatmentPlan", ""),
    }
    prescriptions = request.json.get("prescriptions", [])
    if not isinstance(prescriptions, list) or not all(isinstance(p, dict) for p in prescriptions):
        return jsonify({"error": "prescriptions must be a list of objects"}), 400
    prescriptions = [
        {field: str(p.get(field) or "") for field in PRESCRIPTION_FIELDS} for p in prescriptions
    ]
    newRecord = MedicalRecordService.create_new_record(userId, record_info, prescriptions)
    if not newRecord:
        return jsonify({"error": "The record could not be created"}), 400
    return (
        jsonify(newRecord),
        200,
    )


@record_blueprint.route("/records/prediction", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def generate_prediction_and_report(userId):
    xRayUrl = request.json.get("xRayUrl", "")
    (report, prediction) = ReportGenerationService.generate_report(userId, xRayUrl)
    (findings, impression) = report
    return (
        jsonify(
            {
                "report": {"findings": findings, "impression": impression},
                "predictions": prediction["predictions"],
            }
        ),
        200,
    )

@record_blueprint.route("/records/segments", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def generate_segments_from_xray(userId):
    xRayUrl = request.json.get("xRayUrl", "")
    segmented_image_url = PredictionService.segment_from_url(xRayUrl)

    return (
        jsonify({"segment": segmented_image_url}),
        200,
    )

@record_blueprint.route("/records/segmentation-boxes", methods=["POST"])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def generate_segment_boxes_from_xray(userId):
    xRayUrl = request.json.get("xRayUrl", "")
    res = PredictionService.segment_boxes_from_url(xRayUrl)

    return (
        jsonify(res),
        200,
    )
