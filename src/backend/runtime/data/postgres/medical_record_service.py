from psycopg.types.json import Jsonb

from .base_service import BasePostgresService

# to_json() renders timestamps as ISO 8601 strings.
# Pages of records leave out the report, the heaviest field.
LIST_COLUMNS = """
    id::text AS id, user_id AS "userId", x_ray_url AS "xRayUrl", note, priority,
    treatment_plan AS "treatmentPlan", prescription,
    to_json(created_at) AS created_at, to_json(updated_at) AS updated_at
"""

UPDATABLE_FIELDS = ("xRayUrl", "note", "priority", "treatmentPlan", "report", "prescription")


class MedicalRecordService(BasePostgresService):
    table_name = "medical_records"
    parent_column = "user_id"
    columns = LIST_COLUMNS + ", report"

    def get_paginated_record_by_userId(self, userId, limit, cursor=None):
        return super().get_paginated_items(userId, limit, cursor, LIST_COLUMNS)

    def get_record_by_id(self, uuid):
        return super().get_item_by_id(uuid)

    def create_new_record(self, userId, record):
        return super().query_one(
            f"""
            INSERT INTO medical_records (user_id, x_ray_url, note, priority, report, treatment_plan)
            VALUES (%(userId)s, %(xRayUrl)s, %(note)s, %(priority)s, %(report)s, %(treatmentPlan)s)
            RETURNING {self.columns}
            """,
            {**record, "userId": userId, "report": Jsonb(record["report"])},
        )

    def update_record_by_id(self, uuid, record):
        """Fields that are missing or None keep their stored value."""
        params = {key: record.get(key) for key in UPDATABLE_FIELDS}
        for key in ("report", "prescription"):
            if params[key] is not None:
                params[key] = Jsonb(params[key])
        return super().query_one(
            f"""
            UPDATE medical_records
            SET x_ray_url = COALESCE(%(xRayUrl)s, x_ray_url),
                note = COALESCE(%(note)s, note),
                priority = COALESCE(%(priority)s, priority),
                treatment_plan = COALESCE(%(treatmentPlan)s, treatment_plan),
                report = COALESCE(%(report)s, report),
                prescription = COALESCE(%(prescription)s, prescription),
                updated_at = now()
            WHERE id = %(id)s
            RETURNING {self.columns}
            """,
            {**params, "id": uuid},
        )
