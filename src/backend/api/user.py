from decorators.login_required import requires_doctor_or_own_patient_scope, requires_scopes
from flask import Blueprint, g, jsonify, request
from runtime import IdentityProvider
from scopes import DOCTOR_PATIENTS_READ, DOCTOR_PATIENTS_WRITE, PATIENT_PROFILE_READ

# Define the blueprint
user_blueprint = Blueprint("user", __name__)


def _is_self_or_own_patient(user):
    return user["id"] == g.auth.user_id or user.get("doctor_id") == g.auth.user_id


@user_blueprint.route("/<userId>", methods=["GET"])
@requires_doctor_or_own_patient_scope(DOCTOR_PATIENTS_READ, PATIENT_PROFILE_READ)
def get_user_by_id(userId):
    user = IdentityProvider.get_user_by_id(userId)
    if not user or not _is_self_or_own_patient(user):
        return jsonify({"error": "User not found"}), 404

    return jsonify(user)


@user_blueprint.route("/<userId>", methods=["POST"])
@requires_scopes(DOCTOR_PATIENTS_WRITE)
def update_user_by_id(userId):
    user = IdentityProvider.get_user_by_id(userId)
    if not user or not _is_self_or_own_patient(user):
        return jsonify({"error": "User not found"}), 404

    return jsonify(IdentityProvider.update_user_by_id(userId, request.json))
