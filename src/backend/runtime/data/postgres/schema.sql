-- Applied by app.py on every start, so every statement must be idempotent.
-- Doctors and patients live in Zitadel: user_id holds a Zitadel user id.

-- The list doctors prescribe from, filled on every start
-- by MedicalPrescriptionService.seed_medications (medications.py).
-- category is the section of the medication drop-down. Medications dropped
-- from medications.py are deactivated, not deleted: prescriptions reference them.
CREATE TABLE IF NOT EXISTS medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- Added after the table existed, so databases created before it get it too.
-- Prescriptions written before the medication list have none.
ALTER TABLE medical_prescriptions
    ADD COLUMN IF NOT EXISTS medication_id UUID REFERENCES medications (id);
