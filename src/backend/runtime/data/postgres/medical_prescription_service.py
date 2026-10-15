from .base_service import BasePostgresService
from .medications import MEDICATIONS


class MedicalPrescriptionService(BasePostgresService):
    table_name = "medical_prescriptions"
    parent_column = "record_id"
    # to_json() renders timestamps as ISO 8601 strings
    columns = """
        id::text AS id, record_id::text AS "recordId",
        medication_id::text AS "medicationId",
        (SELECT name FROM medications
         WHERE medications.id = medical_prescriptions.medication_id) AS medication,
        dosage,
        dosage_frequency AS "dosageFrequency", dosage_duration AS "dosageDuration", "time",
        to_json(created_at) AS created_at, to_json(updated_at) AS updated_at
    """

    def seed_medications(self):
        """
        Make the active medications match MEDICATIONS. Safe to run on every start.
        Medications left out are deactivated, not deleted, since prescriptions reference them.
        """
        rows = [(name, category) for category, names in MEDICATIONS.items() for name in names]
        # one transaction: the list never shows half seeded
        with self.pool.connection() as conn:
            conn.cursor().executemany(
                """
                INSERT INTO medications (name, category) VALUES (%s, %s)
                ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, active = true
                """,
                rows,
            )
            conn.execute(
                "UPDATE medications SET active = false WHERE active AND NOT name = ANY(%s)",
                ([name for name, _ in rows],),
            )

    def get_medications(self):
        """The active medications, by category then name."""
        return super().query(
            """
            SELECT id::text AS id, name, category FROM medications
            WHERE active ORDER BY category, name
            """,
            (),
        )

    def get_paginated_prescription_by_recordId(self, recordId, limit, cursor=None):
        return super().get_paginated_items(recordId, limit, cursor)

    def get_prescription_by_id(self, recordId, uuid):
        """A prescription of recordId, or None if that record has no such prescription."""
        return super().query_one(
            f"""
            SELECT {self.columns} FROM medical_prescriptions
            WHERE id = %(id)s AND record_id = %(recordId)s
            """,
            {"id": uuid, "recordId": recordId},
        )

    def create_new_prescription(self, recordId, prescription):
        """Returns None unless the record exists and the medication is active."""
        return super().query_one(
            f"""
            INSERT INTO medical_prescriptions
                (record_id, medication_id, dosage, dosage_frequency, dosage_duration, "time")
            SELECT %(recordId)s::uuid, id, %(dosage)s, %(dosageFrequency)s,
                   %(dosageDuration)s, %(time)s
            FROM medications WHERE id = %(medicationId)s::uuid AND active
            RETURNING {self.columns}
            """,
            {**prescription, "recordId": recordId},
        )

    def update_prescription_by_id(self, recordId, uuid, prescription):
        """
        Update a prescription of recordId. A null medicationId keeps the stored
        medication; any other must be the stored one or an active one.
        Returns None if that record has no such prescription or the medication is refused.
        """
        return super().query_one(
            f"""
            UPDATE medical_prescriptions
            SET medication_id = COALESCE(%(medicationId)s::uuid, medication_id),
                dosage = %(dosage)s, dosage_frequency = %(dosageFrequency)s,
                dosage_duration = %(dosageDuration)s, "time" = %(time)s, updated_at = now()
            WHERE id = %(id)s AND record_id = %(recordId)s
              AND (%(medicationId)s::uuid IS NULL
                   OR %(medicationId)s::uuid = medication_id
                   OR %(medicationId)s::uuid IN (SELECT id FROM medications WHERE active))
            RETURNING {self.columns}
            """,
            {**prescription, "id": uuid, "recordId": recordId},
        )

    def delete_prescription_by_id(self, recordId, uuid):
        """Delete a prescription of recordId. Returns it, or None if that record has no such prescription."""
        return super().query_one(
            f"""
            DELETE FROM medical_prescriptions
            WHERE id = %(id)s AND record_id = %(recordId)s
            RETURNING {self.columns}
            """,
            {"id": uuid, "recordId": recordId},
        )
