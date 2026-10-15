import React, { useState, useEffect } from "react";
import { FiFileText, FiPlus } from "react-icons/fi";
import { getMedicalRecord } from "../../services/api";
import { useAuth } from "../../context/Authentication";
import { formatDate, TextSection } from "./ViewMedicalRecord";
import { PRIMARY_BUTTON_CLASS } from "../Buttons";

// records: the patient's record list, null while it loads
function PatientOverview({ patient, records, onCreate, onView }) {
  const { token } = useAuth();
  const [latestRecord, setLatestRecord] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const latestRecordId = records?.length
    ? [...records].sort(
        (a, b) => new Date(b.timeCreated) - new Date(a.timeCreated)
      )[0].id
    : null;

  useEffect(() => {
    if (!latestRecordId) return;
    setLoadError(false);
    getMedicalRecord(patient.id, latestRecordId, token)
      .then(setLatestRecord)
      .catch(() => setLoadError(true));
  }, [patient.id, latestRecordId, token]);

  if (records?.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl px-6 py-14 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#eaf2f5] text-primary flex items-center justify-center">
          <FiFileText className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          No medical records yet
        </h2>
        <p className="mt-1 text-sm text-gray-600 max-w-sm mx-auto">
          Upload a chest X-ray to create the first record for {patient.name}.
          Clinical notes, AI findings and prescriptions will show up here.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className={`mt-6 ${PRIMARY_BUTTON_CLASS}`}
        >
          <FiPlus className="text-lg" />
          Create first record
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="border border-gray-200 rounded-xl px-6 py-8 text-center text-sm text-gray-600">
        The latest record could not be loaded.
      </div>
    );
  }

  if (!latestRecord) {
    return (
      <div
        className="border border-gray-200 rounded-xl p-6 animate-pulse"
        aria-busy="true"
        aria-label="Loading latest record"
      >
        <div className="h-5 w-32 bg-gray-200 rounded-sm mb-6" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-20 bg-gray-200 rounded-sm" />
          <div className="h-20 bg-gray-200 rounded-sm" />
          <div className="h-20 bg-gray-200 rounded-sm" />
        </div>
      </div>
    );
  }

  const prescriptions = latestRecord.prescriptions?.data || [];

  return (
    <section className="border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Latest record
          </h2>
          <p className="text-sm text-gray-600">
            {formatDate(latestRecord.created_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onView(latestRecord.id)}
          className="text-sm font-medium text-primary hover:text-[#2c5465] px-3 py-1.5 rounded-md hover:bg-gray-50 transition"
        >
          View record
        </button>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-3">
        <TextSection
          title="Clinical notes"
          text={latestRecord.note}
          emptyText="No clinical notes."
        />
        <TextSection
          title="Treatment plan"
          text={latestRecord.treatmentPlan}
          emptyText="No treatment plan."
        />
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1.5">
            Prescriptions
          </h2>
          {prescriptions.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {prescriptions.map((prescription) => (
                <li key={prescription.id} className="py-2 first:pt-0">
                  <p className="text-[15px] font-semibold text-gray-900">
                    {[prescription.medication, prescription.dosage]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  <p className="text-sm text-gray-600">
                    {[
                      prescription.dosageFrequency,
                      prescription.time,
                      prescription.dosageDuration,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-gray-500">No prescriptions.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default PatientOverview;
