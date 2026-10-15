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

    def create_new_record(self, userId, record, prescriptions=()):
        """Insert the record and its prescriptions in one statement: all or nothing."""
        return super().query_one(
            f"""
            WITH new_record AS (
                INSERT INTO medical_records (user_id, x_ray_url, note, priority, report, treatment_plan)
                VALUES (%(userId)s, %(xRayUrl)s, %(note)s, %(priority)s, %(report)s, %(treatmentPlan)s)
                RETURNING *
            ), new_prescriptions AS (
                INSERT INTO medical_prescriptions
                    (record_id, dosage, dosage_frequency, dosage_duration, "time")
                SELECT new_record.id, p->>'dosage', p->>'dosageFrequency', p->>'dosageDuration', p->>'time'
                FROM new_record, jsonb_array_elements(%(prescriptions)s) AS p
            )
            SELECT {self.columns} FROM new_record
            """,
            {
                **record,
                "userId": userId,
                "report": Jsonb(record["report"]),
                "prescriptions": Jsonb(list(prescriptions)),
            },
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


# Region names in reports saved before the model's region-order fix. Until then
# the model service named the detector's regions in anatomical order, but the
# detector numbers them alphabetically, so every stored box label and prediction
# region carried another region's name. The written findings and impression were
# generated from those names and cannot be fixed here; corrected reports get
# "regionNamesCorrected" so the record view can say so.
REGION_NAMES_MIGRATION = "2026-10-region-names"

# The order the model service used to name the detector's classes in
OLD_ORDER = [
    "right upper lung zone",
    "right mid lung zone",
    "right lower lung zone",
    "right costophrenic angle",
    "right hilar structures",
    "right apical zone",
    "left upper lung zone",
    "left mid lung zone",
    "left lower lung zone",
    "left costophrenic angle",
    "left hilar structures",
    "cardiac silhouette",
]
# old name -> the region it really was
TRUE_NAME = dict(zip(OLD_ORDER, sorted(OLD_ORDER)))


def corrected_report(report):
    """The report with its regions renamed, or None when it names no regions."""
    fixed = dict(report)
    renamed = False
    for items_key, name_key in (("predictions", "region"), ("segmentationBoxes", "label")):
        items = report.get(items_key)
        if not isinstance(items, list):
            continue
        fixed[items_key] = [
            {**item, name_key: TRUE_NAME[item[name_key]]}
            if isinstance(item, dict) and item.get(name_key) in TRUE_NAME
            else item
            for item in items
        ]
        renamed = renamed or fixed[items_key] != items
    if not renamed:
        return None
    return {**fixed, "regionNamesCorrected": True}


def fix_region_names(pool):
    """Correct every stored report once; later starts do nothing. Returns how many changed."""
    with pool.connection() as conn:  # one transaction: all reports or none
        first_run = conn.execute(
            "INSERT INTO schema_migrations (name) VALUES (%s) ON CONFLICT DO NOTHING RETURNING name",
            (REGION_NAMES_MIGRATION,),
        ).fetchone()
        if not first_run:
            return 0
        changed = 0
        rows = conn.execute(
            "SELECT id, report FROM medical_records WHERE jsonb_typeof(report) = 'object' FOR UPDATE"
        ).fetchall()
        for record_id, report in rows:
            fixed = corrected_report(report)
            if fixed:
                conn.execute(
                    "UPDATE medical_records SET report = %s WHERE id = %s", (Jsonb(fixed), record_id)
                )
                changed += 1
        print(f"region names corrected in {changed} saved reports")
        return changed
