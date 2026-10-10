from decorators.login_required import requires_scopes
from flask import Blueprint, g, jsonify, request
from runtime import IdentityProvider
from scopes import DOCTOR_PATIENTS_READ, DOCTOR_PATIENTS_WRITE

doctor_bp = Blueprint("doctor_bp", __name__)


def _forbid_other_doctor(doctorId):
    if doctorId != g.auth.user_id:
        return jsonify({"error": "Doctors can only access their own patients"}), 403
    return None


@doctor_bp.route("/patients", methods=["GET"])
@requires_scopes(DOCTOR_PATIENTS_READ)
def get_patients_for_doctor(doctorId):
    forbidden = _forbid_other_doctor(doctorId)
    if forbidden:
        return forbidden
    try:
        users = IdentityProvider.get_patients_by_doctor_id(doctorId)
        return (
            jsonify(list(users) if users else []),
            200,
        )
    except Exception as e:
        return (
            jsonify({"error": str(e)}),
            500,
        )


@doctor_bp.route("/patient", methods=["POST"])
@requires_scopes(DOCTOR_PATIENTS_WRITE)
def add_patient_for_doctor(doctorId):
    forbidden = _forbid_other_doctor(doctorId)
    if forbidden:
        return forbidden
    try:
        body = request.get_json()
        user = IdentityProvider.create_patient(
            doctor_id=doctorId,
            patient_email=body["email"],
            patient_detail={
                "gender": body.get("gender", "other"),
                "birthdate": body.get("birthdate", "yyyy-mm-dd"),
                "name": body.get("name", ""),
            },
        )
        return (
            jsonify(user),
            200,
        )
    except Exception as e:
        status = getattr(e, "status", 500)
        return (
            jsonify({"error": str(e), "message": getattr(e, "message", "")}),
            status if status in (400, 409) else 500,
        )
