"""Permission scopes for LungVisionAI.

Scopes are Zitadel project roles. Doctors and patients are kept apart by the
role key prefix (and by the role group shown in the Zitadel console), so the
backend can tell them apart from the access token alone.
"""

DOCTOR_PREFIX = "doctor:"
PATIENT_PREFIX = "patient:"

DOCTOR_PATIENTS_READ = "doctor:patients:read"
DOCTOR_PATIENTS_WRITE = "doctor:patients:write"
DOCTOR_RECORDS_READ = "doctor:records:read"
DOCTOR_RECORDS_WRITE = "doctor:records:write"

PATIENT_PROFILE_READ = "patient:profile:read"
PATIENT_RECORDS_READ = "patient:records:read"

DOCTOR_SCOPES = (
    DOCTOR_PATIENTS_READ,
    DOCTOR_PATIENTS_WRITE,
    DOCTOR_RECORDS_READ,
    DOCTOR_RECORDS_WRITE,
)
PATIENT_SCOPES = (PATIENT_PROFILE_READ, PATIENT_RECORDS_READ)

# role key -> (display name, role group) as registered in Zitadel
ROLE_DEFINITIONS = {
    DOCTOR_PATIENTS_READ: ("View own patients", "doctor"),
    DOCTOR_PATIENTS_WRITE: ("Create and edit own patients", "doctor"),
    DOCTOR_RECORDS_READ: ("View medical records", "doctor"),
    DOCTOR_RECORDS_WRITE: ("Create medical records and run predictions", "doctor"),
    PATIENT_PROFILE_READ: ("View own profile", "patient"),
    PATIENT_RECORDS_READ: ("View own medical records", "patient"),
}


def is_doctor(scopes):
    return any(scope.startswith(DOCTOR_PREFIX) for scope in scopes)


def is_patient(scopes):
    return any(scope.startswith(PATIENT_PREFIX) for scope in scopes)
