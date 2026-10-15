import React, { useState, useEffect } from "react";
import {
  FiAlertTriangle,
  FiChevronLeft,
  FiEdit2,
  FiImage,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import {
  getMedicalRecord,
  updateMedicalRecord,
  createPrescription,
  updatePrescription,
  deletePrescription,
} from "../../services/api";
import { useAuth } from "../../context/Authentication";
import XrayWithSegmentationBoxes from "./XrayWithSegmentationBoxes";

const PRIORITY_STYLES = {
  High: { pill: "bg-red-50 text-red-700", dot: "bg-red-600" },
  Emergency: { pill: "bg-red-50 text-red-700", dot: "bg-red-600" },
  Medium: { pill: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  Low: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-600" },
};
const PRIORITY_OPTIONS = ["Low", "Medium", "High"];

const PRESCRIPTION_FIELDS = [
  { key: "dosage", label: "Dosage" },
  { key: "dosageFrequency", label: "Frequency" },
  { key: "time", label: "Time" },
  { key: "dosageDuration", label: "Duration" },
];

// A condition predicted at or above this confidence is flagged for the physician
const ALERT_THRESHOLD_DEFAULT = 50;
const ALERT_THRESHOLD_OPTIONS = [30, 40, 50, 60, 70, 80, 90];
const ALERT_THRESHOLD_KEY = "lungvision.alertThreshold";

// The physician's last choice, remembered per browser
const readAlertThreshold = () => {
  try {
    const saved = Number(window.localStorage.getItem(ALERT_THRESHOLD_KEY));
    return ALERT_THRESHOLD_OPTIONS.includes(saved)
      ? saved
      : ALERT_THRESHOLD_DEFAULT;
  } catch {
    return ALERT_THRESHOLD_DEFAULT;
  }
};

// keys for prescription rows that are not saved yet
let nextDraftKey = 0;

export const blankPrescription = () => ({
  key: `new-${++nextDraftKey}`,
  dosage: "",
  dosageFrequency: "",
  time: "",
  dosageDuration: "",
});

// Drops rows left completely blank; null when a remaining row has no dosage
export const completePrescriptions = (rows) => {
  const filled = rows.filter((row) =>
    PRESCRIPTION_FIELDS.some(({ key }) => row[key]?.trim())
  );
  return filled.some((row) => !row.dosage?.trim()) ? null : filled;
};

export const formatDate = (isoDate) =>
  isoDate
    ? new Date(isoDate).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "—";

const formatConfidence = (confidence) => `${Number(confidence).toFixed(1)}%`;

const TextArea = ({ label, value, onChange }) => (
  <textarea
    aria-label={label}
    rows={4}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full border border-gray-300 rounded-lg p-3 text-[15px] leading-relaxed text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
  />
);

// Free-text field that says so when the clinician left it blank.
// Passing onChange turns it into an editor.
export const TextSection = ({ title, text, emptyText, onChange }) => (
  <div>
    <h2 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h2>
    {onChange ? (
      <TextArea label={title} value={text} onChange={onChange} />
    ) : text ? (
      <p className="text-[15px] leading-relaxed text-gray-700 whitespace-pre-line">
        {text}
      </p>
    ) : (
      <p className="text-[15px] text-gray-500">{emptyText}</p>
    )}
  </div>
);

const BackButton = ({ onClick, label = "Back to records" }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="w-10 h-10 shrink-0 rounded-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95 transition"
  >
    <FiChevronLeft className="w-5 h-5" />
  </button>
);

// Passing onChange and onRemove turns the cells into inputs
export const PrescriptionTable = ({ rows, onChange, onRemove }) => {
  const editing = !!onChange;
  return (
    <div className="border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            {PRESCRIPTION_FIELDS.map(({ key, label }) => (
              <th key={key} className="px-3.5 py-2.5 font-medium">
                {label}
              </th>
            ))}
            {editing && (
              <th className="w-10">
                <span className="sr-only">Remove</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row, index) => (
            <tr key={row.id ?? row.key}>
              {PRESCRIPTION_FIELDS.map(({ key, label }) => (
                <td
                  key={key}
                  className={
                    editing
                      ? "p-0"
                      : `px-3.5 py-2.5 ${
                          key === "dosage" ? "font-medium text-gray-900" : ""
                        }`
                  }
                >
                  {editing ? (
                    <input
                      type="text"
                      aria-label={`${label}, prescription ${index + 1}`}
                      placeholder={label}
                      value={row[key] || ""}
                      onChange={(e) => onChange(index, key, e.target.value)}
                      className="w-full bg-transparent px-3.5 py-2.5 focus:outline-none focus:bg-[#eaf2f5]"
                    />
                  ) : (
                    row[key] || "—"
                  )}
                </td>
              ))}
              {editing && (
                <td className="px-1">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label={`Remove prescription ${index + 1}`}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-red-700 hover:bg-red-50 transition"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Pass newRecord (with onSave) to show a record that is not saved yet, in the
// same layout it will have once saved. Edits then stay local until onSave.
function ViewMedicalRecord({ userId, recordId, onBack, newRecord, onSave }) {
  const { token } = useAuth();
  const [record, setRecord] = useState(newRecord || null);
  const [loadError, setLoadError] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [alertThreshold, setAlertThreshold] = useState(readAlertThreshold);
  // the fields being edited; null while viewing
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadRecord = () => {
    setLoadError(false);
    getMedicalRecord(userId, recordId, token)
      .then(setRecord)
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    if (!newRecord) loadRecord();
  }, [userId, recordId, token]);

  const changeAlertThreshold = (value) => {
    setAlertThreshold(value);
    try {
      window.localStorage.setItem(ALERT_THRESHOLD_KEY, String(value));
    } catch {
      // storage is blocked: the choice lasts until the page closes
    }
  };

  if (loadError) {
    return (
      <div className="p-6">
        <BackButton onClick={onBack} />
        <div className="py-16 text-center">
          <p className="font-medium text-gray-900">
            This record could not be loaded.
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={loadRecord}
            className="mt-5 px-4 py-2 bg-primary text-white rounded-md hover:bg-[#2c5465] active:scale-[0.97] transition font-medium"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-6 animate-pulse" aria-busy="true" aria-label="Loading record">
        <div className="h-10 w-56 bg-gray-200 rounded-lg mb-6" />
        <div className="flex flex-wrap gap-8">
          <div className="flex-[1_1_560px] h-[520px] bg-gray-200 rounded-xl" />
          <div className="flex-[1_1_420px] space-y-3">
            <div className="h-5 w-32 bg-gray-200 rounded-sm" />
            <div className="h-20 bg-gray-200 rounded-sm" />
            <div className="h-5 w-24 bg-gray-200 rounded-sm" />
            <div className="h-28 bg-gray-200 rounded-sm" />
          </div>
        </div>
      </div>
    );
  }

  const report = record.report || {};
  const prescriptions = record.prescriptions?.data || [];
  const regions = (report.predictions || []).map((prediction) => {
    const conditions = [...prediction.conditions].sort(
      (a, b) => b.confidence - a.confidence
    );
    return {
      name: prediction.region,
      conditions,
      flagged: conditions.filter((c) => c.confidence >= alertThreshold),
    };
  });
  const flaggedRegions = regions.filter((region) => region.flagged.length > 0);
  const selected =
    regions.find((region) => region.name === selectedRegion) ||
    flaggedRegions[0] ||
    regions[0];
  const priority = record.priority || "Low";
  const priorityStyle = PRIORITY_STYLES[priority] || {
    pill: "bg-gray-100 text-gray-700",
    dot: "bg-gray-500",
  };

  const startEditing = () => {
    setSaveError("");
    setDraft({
      priority,
      impression: report.impression || "",
      findings: report.findings || "",
      note: record.note || "",
      treatmentPlan: record.treatmentPlan || "",
      prescriptions: prescriptions.map((prescription) => ({ ...prescription })),
    });
  };

  const cancelEditing = () => {
    setDraft(null);
    setSaveError("");
  };

  const goBack = () => {
    if (draft && !window.confirm("Discard your unsaved changes?")) return;
    // a new record hands back its edits so they survive a trip back to step 1
    onBack(record);
  };

  const setDraftField = (field) => (value) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const changePrescription = (index, field, value) =>
    setDraft((current) => ({
      ...current,
      prescriptions: current.prescriptions.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));

  const addPrescription = () =>
    setDraft((current) => ({
      ...current,
      prescriptions: [...current.prescriptions, blankPrescription()],
    }));

  const removePrescription = (index) =>
    setDraft((current) => ({
      ...current,
      prescriptions: current.prescriptions.filter((_, i) => i !== index),
    }));

  const saveChanges = async () => {
    const rows = completePrescriptions(draft.prescriptions);
    if (!rows) {
      setSaveError("Each prescription needs a dosage.");
      return;
    }

    if (newRecord) {
      // nothing is stored yet: the edits wait here until onSave
      setSaveError("");
      setRecord({
        ...record,
        priority: draft.priority,
        note: draft.note,
        treatmentPlan: draft.treatmentPlan,
        report: { ...report, impression: draft.impression, findings: draft.findings },
        prescriptions: { data: rows },
      });
      setDraft(null);
      return;
    }

    setSaving(true);
    setSaveError("");
    let failed = false;
    const attempt = async (request) => {
      try {
        return await request();
      } catch (error) {
        console.error("Could not save the record:", error);
        failed = true;
      }
    };

    await attempt(() =>
      updateMedicalRecord(
        userId,
        record.id,
        {
          priority: draft.priority,
          note: draft.note,
          treatmentPlan: draft.treatmentPlan,
          report: {
            ...report,
            impression: draft.impression,
            findings: draft.findings,
          },
        },
        token
      )
    );
    for (const removed of prescriptions.filter(
      (prescription) => !rows.some((row) => row.id === prescription.id)
    )) {
      await attempt(() =>
        deletePrescription(userId, record.id, removed.id, token)
      );
    }
    const savedRows = [];
    for (const row of rows) {
      if (!row.id) {
        const created = await attempt(() =>
          createPrescription(userId, record.id, row, token)
        );
        if (!created?.id) failed = true;
        // keep the new id so a retry updates the row instead of adding it twice
        savedRows.push(created?.id ? { ...row, id: created.id } : row);
        continue;
      }
      const original = prescriptions.find((p) => p.id === row.id);
      const changed = PRESCRIPTION_FIELDS.some(
        ({ key }) => (row[key] || "") !== (original?.[key] || "")
      );
      if (changed) {
        await attempt(() =>
          updatePrescription(userId, record.id, row.id, row, token)
        );
      }
      savedRows.push(row);
    }

    try {
      setRecord(await getMedicalRecord(userId, record.id, token));
      if (failed) {
        setDraft((current) => ({ ...current, prescriptions: savedRows }));
        setSaveError("Some changes could not be saved. Check them and try again.");
      } else {
        setDraft(null);
      }
    } catch {
      setDraft(null);
      setLoadError(true);
    } finally {
      setSaving(false);
    }
  };

  const saveNewRecord = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(record);
    } catch (error) {
      setSaveError(error.message);
      setSaving(false);
    }
  };

  const hasAiContent = report.impression || report.findings || regions.length > 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-start gap-3">
          <BackButton
            onClick={goBack}
            label={newRecord ? "Back to record details" : undefined}
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {newRecord ? "New record" : `RID-${record.id.split("-")[0]}`}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {newRecord ? (
                "Not saved yet. Review the AI analysis, then save the record."
              ) : (
                <>
                  Created {formatDate(record.created_at)} · Updated{" "}
                  {formatDate(record.updated_at)}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {draft ? (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Priority
                <select
                  value={draft.priority}
                  onChange={(e) => setDraftField("priority")(e.target.value)}
                  className="border border-gray-300 rounded-md px-2.5 py-1.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[...new Set([...PRIORITY_OPTIONS, draft.priority])].map(
                    (option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    )
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 active:scale-[0.97] transition font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveChanges}
                disabled={saving}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-[#2c5465] active:scale-[0.97] transition font-medium disabled:opacity-60"
              >
                {saving ? "Saving…" : newRecord ? "Done" : "Save changes"}
              </button>
            </>
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${priorityStyle.pill}`}
              >
                <span className={`w-2 h-2 rounded-full ${priorityStyle.dot}`} />
                {priority} priority
              </span>
              <button
                type="button"
                onClick={startEditing}
                disabled={saving}
                className="disabled:opacity-50 inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 active:scale-[0.97] transition font-medium"
              >
                <FiEdit2 className="w-4 h-4" />
                Edit record
              </button>
              {newRecord && (
                <button
                  type="button"
                  onClick={saveNewRecord}
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-[#2c5465] active:scale-[0.97] transition font-medium disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save record"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {saveError && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap gap-8 items-start">
        {/* X-ray and regions */}
        <div className="flex-[1_1_560px] min-w-0 space-y-4">
          <div className="bg-[#0e1518] rounded-xl p-4 pb-6">
            <div className="flex justify-between gap-4 text-[13px] text-[#9fb3bd] mb-4">
              <span>Chest X-ray</span>
              {selected && (
                <span
                  className={`first-letter:uppercase ${
                    selected.flagged.length ? "text-red-300" : ""
                  }`}
                >
                  {selected.name}
                </span>
              )}
            </div>
            {record.xRayUrl ? (
              <div className="max-w-[500px] mx-auto">
                <XrayWithSegmentationBoxes
                  src={record.xRayUrl}
                  boundingBoxes={report.segmentationBoxes || []}
                  onSelectLabel={setSelectedRegion}
                  selectedLabel={selected?.name}
                  flaggedLabels={flaggedRegions.map((region) => region.name)}
                />
              </div>
            ) : (
              <div className="aspect-square max-w-[500px] mx-auto flex flex-col items-center justify-center gap-2 text-[#9fb3bd]">
                <FiImage className="w-8 h-8" />
                <p className="text-sm">No X-ray attached to this record</p>
              </div>
            )}
          </div>

          {regions.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    flaggedRegions.length ? "text-red-700" : "text-gray-600"
                  }`}
                >
                  {flaggedRegions.length > 0 && (
                    <FiAlertTriangle className="w-4 h-4" aria-hidden="true" />
                  )}
                  {flaggedRegions.length
                    ? `${flaggedRegions.length} of ${regions.length} regions flagged`
                    : "No regions flagged"}
                </p>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  Alert threshold
                  <select
                    value={alertThreshold}
                    onChange={(e) => changeAlertThreshold(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {ALERT_THRESHOLD_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        ≥ {option}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {regions.map((region) => {
                  const isFlagged = region.flagged.length > 0;
                  const isSelected = region === selected;
                  return (
                    <button
                      key={region.name}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedRegion(region.name)}
                      className={`text-left px-3.5 py-3 rounded-lg border transition active:scale-[0.98] ${
                        isFlagged
                          ? isSelected
                            ? "border-red-600 bg-red-50 ring-1 ring-red-600"
                            : "border-red-300 bg-red-50 hover:bg-red-100"
                          : isSelected
                          ? "border-primary bg-[#eaf2f5] ring-1 ring-primary"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex items-center gap-1.5 text-sm font-semibold ${
                          isFlagged ? "text-red-800" : "text-gray-900"
                        }`}
                      >
                        {isFlagged && (
                          <FiAlertTriangle
                            className="w-3.5 h-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate first-letter:uppercase">
                          {region.name}
                        </span>
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-[13px] first-letter:uppercase ${
                          isFlagged ? "text-red-700" : "text-gray-500"
                        }`}
                      >
                        {isFlagged
                          ? region.flagged.map((c) => c.condition).join(", ")
                          : "Nothing flagged"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Report and clinician notes */}
        <div className="flex-[1_1_420px] min-w-0">
          <section className="pb-6 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Impression
            </h2>
            {draft ? (
              <TextArea
                label="Impression"
                value={draft.impression}
                onChange={setDraftField("impression")}
              />
            ) : report.impression ? (
              <p className="text-lg leading-relaxed text-gray-900 whitespace-pre-line">
                {report.impression}
              </p>
            ) : (
              <p className="text-[15px] text-gray-500">
                No AI impression on this record.
              </p>
            )}
            <h3 className="text-sm font-semibold text-gray-700 mt-5 mb-1.5">
              Findings
            </h3>
            {draft ? (
              <TextArea
                label="Findings"
                value={draft.findings}
                onChange={setDraftField("findings")}
              />
            ) : report.findings ? (
              <p className="text-[15px] leading-relaxed text-gray-700 whitespace-pre-line">
                {report.findings}
              </p>
            ) : (
              <p className="text-[15px] text-gray-500">
                No AI findings on this record.
              </p>
            )}
            {hasAiContent && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2.5 text-[13px] font-medium text-orange-800">
                <FiAlertTriangle
                  className="w-4 h-4 mt-px shrink-0 text-orange-600"
                  aria-hidden="true"
                />
                AI-generated report. Review against the image before acting on
                it.
              </p>
            )}
          </section>

          {selected && (
            <section className="py-6 border-b border-gray-200">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2
                  className={`text-base font-semibold first-letter:uppercase ${
                    selected.flagged.length ? "text-red-800" : "text-gray-900"
                  }`}
                >
                  {selected.name}
                </h2>
                {selected.flagged.length > 0 && (
                  <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-[13px] font-semibold text-red-700">
                    {selected.flagged.length} flagged
                  </span>
                )}
              </div>
              <ul className="space-y-2.5">
                {selected.conditions
                  .slice(0, Math.max(5, selected.flagged.length))
                  .map((finding) => {
                    const isFlagged = finding.confidence >= alertThreshold;
                    return (
                      <li
                        key={finding.condition}
                        className="grid grid-cols-[minmax(0,1fr)_120px_56px] items-center gap-3 text-sm"
                      >
                        <span
                          className={`flex items-center gap-1.5 ${
                            isFlagged ? "text-red-700 font-medium" : "text-gray-900"
                          }`}
                        >
                          {isFlagged && (
                            <FiAlertTriangle
                              className="w-3.5 h-3.5 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <span className="first-letter:uppercase">
                            {finding.condition}
                          </span>
                          {isFlagged && <span className="sr-only">(flagged)</span>}
                        </span>
                        <span className="relative h-1.5 rounded-full bg-gray-200">
                          <span
                            className={`block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300 ease-out ${
                              isFlagged ? "bg-red-600" : "bg-primary"
                            }`}
                            style={{ width: `${finding.confidence}%` }}
                          />
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -bottom-1 w-px bg-gray-500"
                            style={{ left: `${alertThreshold}%` }}
                          />
                        </span>
                        <span
                          className={`text-right tabular-nums ${
                            isFlagged ? "text-red-700 font-medium" : "text-gray-600"
                          }`}
                        >
                          {formatConfidence(finding.confidence)}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              <p className="mt-3 text-[13px] text-gray-500">
                Flagged at ≥ {alertThreshold}% confidence, marked by the line on
                each bar.
              </p>
            </section>
          )}

          <section className="pt-6 space-y-5">
            <TextSection
              title="Clinical notes"
              text={draft ? draft.note : record.note}
              emptyText="No clinical notes."
              onChange={draft && setDraftField("note")}
            />
            <TextSection
              title="Treatment plan"
              text={draft ? draft.treatmentPlan : record.treatmentPlan}
              emptyText="No treatment plan."
              onChange={draft && setDraftField("treatmentPlan")}
            />
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-2">
                Prescriptions
              </h2>
              {draft ? (
                <>
                  {draft.prescriptions.length > 0 && (
                    <PrescriptionTable
                      rows={draft.prescriptions}
                      onChange={changePrescription}
                      onRemove={removePrescription}
                    />
                  )}
                  <button
                    type="button"
                    onClick={addPrescription}
                    className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-primary hover:bg-gray-50 transition"
                  >
                    <FiPlus className="w-4 h-4" />
                    Add prescription
                  </button>
                </>
              ) : prescriptions.length > 0 ? (
                <PrescriptionTable rows={prescriptions} />
              ) : (
                <p className="text-[15px] text-gray-500">No prescriptions.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default ViewMedicalRecord;
