import React, { useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiCheck, FiPlus, FiX } from "react-icons/fi";
import {
  uploadFile,
  getPredictionAndReport,
  getSegmentationBoxes,
  createRecordForUser,
} from "../../services/api";
import { useAuth } from "../../context/Authentication";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../Buttons";
import { dicomToJpeg } from "../../services/dicom";
import ViewMedicalRecord, {
  PrescriptionTable,
  blankPrescription,
  completePrescriptions,
} from "./ViewMedicalRecord";

const ACCEPTED_FILE = /\.(jpe?g|png|gif|dcm)$/i;

const INPUT =
  "w-full border border-gray-300 rounded-lg p-3 text-[15px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";

const Spinner = ({ className = "w-4 h-4" }) => (
  <span
    aria-hidden="true"
    className={`${className} shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin`}
  />
);

const formatElapsed = (ms) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

// Time since `since`, ticking once a second
function Elapsed({ since }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return formatElapsed(now - since);
}

const useObjectUrl = (file) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
};

// The AI analysis step doubles as the analysis status, so the clinician can
// keep filling in the record while it runs
function Steps({ step, analysis }) {
  const status = step === 1 ? analysis?.status : null;
  const node =
    step === 2
      ? "bg-primary text-white"
      : status === "done"
      ? "bg-[#e7f0f3] text-primary border-[1.5px] border-primary"
      : status === "error"
      ? "bg-red-50 text-red-700 border-[1.5px] border-red-300"
      : status === "running"
      ? "bg-white text-primary border-2 border-[#c9dbe2]"
      : "bg-white text-gray-400 border-2 border-gray-300";

  return (
    <>
      <ol className="flex items-center gap-4 max-w-2xl mx-auto">
        <li className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center font-medium text-lg">
            {step === 2 ? <FiCheck className="w-5 h-5" aria-label="Done" /> : 1}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-primary">Record details</span>
            <span className="block text-sm text-gray-500 max-sm:hidden">
              Enter medical information
            </span>
          </span>
        </li>
        <li
          aria-hidden="true"
          className={`flex-1 h-0.5 min-w-6 rounded-full transition-colors duration-300 ${
            step === 2 ? "bg-primary" : "bg-gray-200"
          }`}
        />
        <li className="flex items-center gap-3 min-w-0">
          <span
            className={`relative w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-medium text-lg transition-colors duration-300 ${node}`}
          >
            {status === "running" && (
              <svg
                aria-hidden="true"
                viewBox="0 0 48 48"
                className="absolute -inset-1 w-12 h-12 text-primary motion-safe:animate-spin"
              >
                <circle
                  cx="24"
                  cy="24"
                  r="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="34 104"
                />
              </svg>
            )}
            {status === "done" ? (
              <FiCheck className="w-5 h-5" aria-hidden="true" />
            ) : status === "error" ? (
              <FiAlertTriangle className="w-4 h-4" aria-hidden="true" />
            ) : (
              2
            )}
          </span>
          <span className="min-w-0">
            <span
              className={`block font-medium ${
                step === 2 || status ? "text-primary" : "text-gray-400"
              }`}
            >
              AI analysis
            </span>
            <span
              className={`block text-sm tabular-nums whitespace-nowrap ${
                status === "done"
                  ? "font-semibold text-[#2c5465]"
                  : status === "error"
                  ? "text-red-700"
                  : "text-gray-500"
              }`}
            >
              {status === "running" ? (
                <>
                  Analyzing · <Elapsed since={analysis.startedAt} />
                </>
              ) : status === "done" ? (
                "Ready to review"
              ) : status === "error" ? (
                "Analysis failed"
              ) : (
                "Review AI findings"
              )}
            </span>
          </span>
        </li>
      </ol>
      <p className="sr-only" aria-live="polite">
        {status === "running"
          ? "Analyzing the X-ray."
          : status === "done"
          ? "The AI analysis is ready to review."
          : status === "error"
          ? "The AI analysis failed."
          : ""}
      </p>
    </>
  );
}

function XRayUpload({ xRay, error, onFile, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const preview = useObjectUrl(xRay?.file);

  if (xRay) {
    return (
      <div className="relative bg-[#0e1518] rounded-xl p-4">
        <div className="aspect-square max-h-[420px] mx-auto flex items-center justify-center">
          {preview ? (
            <img
              src={preview}
              alt="Uploaded X-ray"
              className="max-w-full max-h-full object-contain rounded-sm"
            />
          ) : (
            <Spinner className="w-6 h-6 text-[#9fb3bd]" />
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[#9fb3bd]">
          <span className="truncate text-[#e6eef1]">{xRay.name}</span>
          <span className="flex items-center gap-1.5 shrink-0">
            {xRay.status === "uploading" ? (
              <>
                <Spinner className="w-3 h-3" />
                Uploading…
              </>
            ) : (
              "Uploaded"
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove X-ray"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-95 transition"
        >
          <FiX className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFile(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col justify-center items-center gap-3 border-2 border-dashed rounded-xl p-10 transition-colors ${
          dragging ? "border-primary bg-[#eaf2f5]" : "border-gray-300 bg-gray-50 hover:border-gray-400"
        }`}
      >
        <img src="/file-upload.png" alt="" className="w-20 h-20 object-contain" />
        <p className="text-gray-700 font-medium">Drag and drop an X-ray here</p>
        <div className="relative w-32 flex items-center justify-center my-1">
          <div className="absolute w-full h-px bg-gray-300" />
          <span className="relative bg-gray-50 px-2 text-gray-500 text-sm">or</span>
        </div>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.dcm"
          onChange={(e) => {
            onFile(e.target.files[0]);
            // lets the same file be chosen again after removing it
            e.target.value = "";
          }}
          className="peer sr-only"
          id="xray-file"
        />
        <label
          htmlFor="xray-file"
          className="text-primary border border-primary px-4 py-2 rounded-md hover:bg-primary hover:text-white transition-colors cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2"
        >
          Browse files
        </label>
        <p className="text-[13px] text-gray-500">JPG, PNG, GIF or DICOM</p>
      </div>
      {error && (
        <p role="alert" className="text-error text-sm mt-2">
          {error}
        </p>
      )}
    </>
  );
}

function CreateMedicalRecord({ patient, onCancel, onCreated }) {
  const { token, user } = useAuth();
  const [step, setStep] = useState(1);
  // { name, file, status: "uploading" | "ready", url }
  const [xRay, setXRay] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [details, setDetails] = useState({
    priority: "Low",
    note: "",
    treatmentPlan: "",
    prescriptions: [],
  });
  // { status: "running" | "done" | "error", startedAt, report }
  const [analysis, setAnalysis] = useState(null);
  // Continue was pressed before the analysis finished
  const [waiting, setWaiting] = useState(false);
  const [formError, setFormError] = useState("");
  // the latest file choice; results for an earlier choice are dropped
  const selection = useRef(null);

  // Runs as soon as the upload finishes, while the clinician fills in the record
  const startAnalysis = (url, choice) => {
    setAnalysis({ status: "running", startedAt: Date.now() });
    Promise.all([
      getPredictionAndReport(patient.id, url, token),
      getSegmentationBoxes(user?.id, url, token),
    ])
      .then(([prediction, segmentationBoxes]) => {
        if (selection.current !== choice) return;
        setAnalysis({
          status: "done",
          report: {
            findings: prediction.report.findings,
            impression: prediction.report.impression,
            predictions: prediction.predictions,
            segmentationBoxes,
          },
        });
      })
      .catch((error) => {
        console.error("Analysis failed:", error);
        if (selection.current !== choice) return;
        setAnalysis({ status: "error" });
        setWaiting(false);
      });
  };

  const chooseFile = async (file) => {
    if (!file) return;
    if (!ACCEPTED_FILE.test(file.name)) {
      setUploadError("Choose a JPG, PNG, GIF or DICOM file.");
      return;
    }
    const choice = {};
    selection.current = choice;
    setUploadError("");
    setAnalysis(null);
    setWaiting(false);
    setXRay({ name: file.name, file: null, status: "uploading" });
    try {
      // DICOM files are converted to JPEG in the browser before uploading
      const upload = file.name.toLowerCase().endsWith(".dcm")
        ? await dicomToJpeg(file)
        : file;
      if (selection.current !== choice) return;
      setXRay({ name: file.name, file: upload, status: "uploading" });
      const url = await uploadFile(upload, token);
      if (selection.current !== choice) return;
      // uploadFile resolves without a URL when the storage upload fails
      if (!url) throw new Error("The X-ray could not be uploaded. Try again.");
      setXRay({ name: file.name, file: upload, status: "ready", url });
      startAnalysis(url, choice);
    } catch (error) {
      console.error("Error uploading file:", error);
      if (selection.current !== choice) return;
      setXRay(null);
      setUploadError(error.message || "This file could not be uploaded.");
    }
  };

  const removeXRay = () => {
    selection.current = null;
    setXRay(null);
    setAnalysis(null);
    setWaiting(false);
  };

  const retryAnalysis = () => startAnalysis(xRay.url, selection.current);

  const setDetail = (field) => (e) =>
    setDetails((current) => ({ ...current, [field]: e.target.value }));

  const changePrescription = (index, field, value) =>
    setDetails((current) => ({
      ...current,
      prescriptions: current.prescriptions.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));

  const goToReview = () => {
    const rows = completePrescriptions(details.prescriptions);
    if (!rows) return setFormError("Each prescription needs a dosage.");
    setFormError("");
    setDetails((current) => ({ ...current, prescriptions: rows }));
    setStep(2);
  };

  const continueToReview = () => {
    if (analysis?.status === "done") return goToReview();
    // check now, not only when the results land
    if (!completePrescriptions(details.prescriptions)) {
      return setFormError("Each prescription needs a dosage.");
    }
    setFormError("");
    if (analysis?.status === "error") retryAnalysis();
    setWaiting(true);
  };

  const hasInput =
    xRay ||
    details.note ||
    details.treatmentPlan ||
    details.prescriptions.length > 0 ||
    details.priority !== "Low";
  const cancel = () => {
    if (
      hasInput &&
      !window.confirm("Discard this record? The X-ray and everything you entered will be lost.")
    ) {
      return;
    }
    onCancel();
  };

  // Continue was pressed early: step 2 opens by itself once the results land
  useEffect(() => {
    if (waiting && analysis?.status === "done") {
      setWaiting(false);
      goToReview();
    }
  }, [waiting, analysis]);

  // Step 2 hands back its edits, so they survive a trip back to step 1
  const backToDetails = (record) => {
    setDetails({
      priority: record.priority,
      note: record.note,
      treatmentPlan: record.treatmentPlan,
      prescriptions: record.prescriptions.data,
    });
    setAnalysis((current) => ({ ...current, report: record.report }));
    setStep(1);
  };

  // The record and its prescriptions are created in one request: all or nothing
  const saveRecord = async (record) => {
    let created;
    try {
      created = await createRecordForUser(patient.id, record, token);
    } catch (error) {
      console.error("Could not save the record:", error);
      throw new Error("The record could not be saved. Check your connection and try again.");
    }
    onCreated(created);
  };

  if (step === 2) {
    return (
      <div>
        <div className="px-6 pt-6">
          <Steps step={2} analysis={analysis} />
        </div>
        <ViewMedicalRecord
          userId={patient.id}
          newRecord={{
            xRayUrl: xRay.url,
            priority: details.priority,
            note: details.note,
            treatmentPlan: details.treatmentPlan,
            report: analysis.report,
            prescriptions: { data: details.prescriptions },
          }}
          onBack={backToDetails}
          onSave={saveRecord}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Steps step={1} analysis={analysis} />

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:px-2">
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">X-ray image</h2>
          <XRayUpload
            xRay={xRay}
            error={uploadError}
            onFile={chooseFile}
            onRemove={removeXRay}
          />
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="record-priority" className="block text-sm font-medium text-gray-700 mb-2">
              Priority
            </label>
            <select
              id="record-priority"
              value={details.priority}
              onChange={setDetail("priority")}
              className={`${INPUT} bg-white`}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <div>
            <label htmlFor="record-note" className="block text-sm font-medium text-gray-700 mb-2">
              Clinical notes
            </label>
            <textarea
              id="record-note"
              value={details.note}
              onChange={setDetail("note")}
              rows={4}
              className={INPUT}
              placeholder="Enter clinical notes..."
            />
          </div>

          <div>
            <label htmlFor="record-plan" className="block text-sm font-medium text-gray-700 mb-2">
              Treatment plan
            </label>
            <textarea
              id="record-plan"
              value={details.treatmentPlan}
              onChange={setDetail("treatmentPlan")}
              rows={4}
              className={INPUT}
              placeholder="Enter treatment plan..."
            />
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Prescriptions</h2>
            {details.prescriptions.length > 0 && (
              <PrescriptionTable
                rows={details.prescriptions}
                onChange={changePrescription}
                onRemove={(index) =>
                  setDetails((current) => ({
                    ...current,
                    prescriptions: current.prescriptions.filter((_, i) => i !== index),
                  }))
                }
              />
            )}
            <button
              type="button"
              onClick={() =>
                setDetails((current) => ({
                  ...current,
                  prescriptions: [...current.prescriptions, blankPrescription()],
                }))
              }
              className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-primary hover:bg-gray-50 transition"
            >
              <FiPlus className="w-4 h-4" />
              Add prescription
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-end gap-3">
        {analysis?.status === "error" && (
          <p role="alert" className="flex items-center gap-2 text-sm text-red-700">
            <FiAlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            The AI analysis could not be completed.
            <button
              type="button"
              onClick={retryAnalysis}
              className="font-semibold text-primary hover:underline underline-offset-2"
            >
              Try again
            </button>
          </p>
        )}
        {formError && (
          <p role="alert" className="text-sm text-red-700">
            {formError}
          </p>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={cancel} className={SECONDARY_BUTTON_CLASS}>
            Cancel
          </button>
          <button
            type="button"
            onClick={continueToReview}
            disabled={xRay?.status !== "ready" || waiting}
            aria-busy={waiting}
            className={PRIMARY_BUTTON_CLASS}
          >
            {waiting && <Spinner />}
            {waiting ? "Waiting for analysis…" : "Continue to analysis"}
          </button>
        </div>
        {xRay?.status !== "ready" && (
          <p className="text-[13px] text-gray-500">
            {xRay ? "Continue is available once the upload finishes." : "Upload an X-ray to continue."}
          </p>
        )}
      </div>
    </div>
  );
}

export default CreateMedicalRecord;
