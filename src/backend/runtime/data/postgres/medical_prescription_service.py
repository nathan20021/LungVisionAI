from .base_service import BasePostgresService


class MedicalPrescriptionService(BasePostgresService):
    table_name = "medical_prescriptions"
    parent_column = "record_id"
    # to_json() renders timestamps as ISO 8601 strings
    columns = """
        id::text AS id, record_id::text AS "recordId", dosage,
        dosage_frequency AS "dosageFrequency", dosage_duration AS "dosageDuration", "time",
        to_json(created_at) AS created_at, to_json(updated_at) AS updated_at
    """

    def get_paginated_prescription_by_recordId(self, recordId, limit, cursor=None):
        return super().get_paginated_items(recordId, limit, cursor)

    def get_prescription_by_id(self, uuid):
        return super().get_item_by_id(uuid)

    def create_new_prescription(self, recordId, prescription):
        return super().query_one(
            f"""
            INSERT INTO medical_prescriptions
                (record_id, dosage, dosage_frequency, dosage_duration, "time")
            VALUES (%(recordId)s, %(dosage)s, %(dosageFrequency)s, %(dosageDuration)s, %(time)s)
            RETURNING {self.columns}
            """,
            {**prescription, "recordId": recordId},
        )

    def update_prescription_by_id(self, uuid, prescription):
        return super().query_one(
            f"""
            UPDATE medical_prescriptions
            SET dosage = %(dosage)s, dosage_frequency = %(dosageFrequency)s,
                dosage_duration = %(dosageDuration)s, "time" = %(time)s, updated_at = now()
            WHERE id = %(id)s
            RETURNING {self.columns}
            """,
            {**prescription, "id": uuid},
        )
