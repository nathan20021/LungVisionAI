-- Applied by app.py on every start, so every statement must be idempotent.
-- Doctors and patients live in Zitadel: user_id holds a Zitadel user id.

CREATE TABLE IF NOT EXISTS medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    x_ray_url TEXT,
    note TEXT,
    priority TEXT,
    report JSONB,
    treatment_plan TEXT,
    prescription JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medical_records_user_id_idx
    ON medical_records (user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS medical_prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES medical_records (id) ON DELETE CASCADE,
    dosage TEXT,
    dosage_frequency TEXT,
    dosage_duration TEXT,
    "time" TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medical_prescriptions_record_id_idx
    ON medical_prescriptions (record_id, created_at DESC, id DESC);

-- One-time data fixes that already ran (see medical_record_service.py)
CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
