import React, { useState, useEffect } from "react";
import { FiPlus } from "react-icons/fi";
import CreateMedicalRecord from "./CreateMedicalRecord";
import ViewMedicalRecord from "./ViewMedicalRecord";
import PatientOverview from "./PatientOverview";
import { PRIMARY_BUTTON_CLASS } from "../Buttons";
import {
  getMedicalRecordsForPatient,
  parseRecordData,
} from "../../services/api";
import { useAuth } from "../../context/Authentication";

function PatientMedicalRecords({ patient }) {
  const { token } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [viewingRecord, setViewingRecord] = useState(null);
  // null until the first load finishes
  const [medicalRecords, setMedicalRecords] = useState(null);
  const [recordsError, setRecordsError] = useState(false);

  useEffect(() => {
    getMedicalRecordsForPatient(patient.id, token)
      .then((data) => setMedicalRecords(data))
      .catch(() => setRecordsError(true));
  }, [patient.id, token]);

  if (viewingRecord) {
    return (
      <ViewMedicalRecord
        userId={patient.id}
        recordId={viewingRecord}
        onBack={() => setViewingRecord(null)}
      />
    );
  }

  if (isCreating) {
    return (
      <CreateMedicalRecord
        patient={patient}
        onCancel={() => setIsCreating(false)}
        onCreated={(record) => {
          setMedicalRecords((prevRecords) => [
            ...prevRecords,
            parseRecordData(record),
          ]);
          setIsCreating(false);
        }}
      />
    );
  }

  if (recordsError) {
    return (
      <div className="p-6 py-16 text-center text-sm text-gray-600">
        Medical records could not be loaded. Refresh the page to try again.
      </div>
    );
  }

  // Medical Records List
  return (
    <div className="p-6 space-y-8">
      <PatientOverview
        patient={patient}
        records={medicalRecords}
        onCreate={() => setIsCreating(true)}
        onView={setViewingRecord}
      />

      {medicalRecords?.length > 0 && (
        <section>
          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Medical records
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => setIsCreating(true)}
                className={PRIMARY_BUTTON_CLASS}
              >
                <FiPlus className="text-lg" />
                <span>Create New Record</span>
              </button>
              {/* <button className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-none">
                <FiArrowUp className="text-lg" />
                <span>Compare Records</span>
              </button> */}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Record ID
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Priority
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Report
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Created
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
              {medicalRecords
                .sort((a, b) => new Date(b.timeCreated) - new Date(a.timeCreated))  // Sort by timeCreated in descending order
                .map((record) => (
                  <tr
                    key={record.id || record.friendlyId || Date.now().toString()}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setViewingRecord(record.id)}
                        className="text-sm text-primary hover:text-[#2c5465] hover:underline"
                      >
                        {record.friendlyId || record.recordId || `RID-${record.id}`}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 aspect-square rounded-full"
                          style={{
                            backgroundColor:
                              record.priority === "Emergency"
                                ? "red"
                                : record.priority === "Low"
                                ? "green"
                                : record.priority === "Medium"
                                ? "orange"
                                : "gray",
                          }}
                        ></div>
                        <span className="px-2 py-1 rounded-full text-xs">
                          {record.priority || "Low"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          record.reportStatus === "Completed"
                            ? "bg-green-100 text-green-800"
                            : record.reportStatus === "In Progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {record.reportStatus || "Pending"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {record.timeCreated
                        ? new Date(record.timeCreated).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {record.timeUpdated
                        ? new Date(record.timeUpdated).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* <div className="flex items-center justify-between px-6 py-3 border-t">
              <div className="text-sm text-gray-500">
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 text-sm border rounded-sm text-gray-500 hover:bg-gray-50 transition-all duration-200 hover:shadow-xs hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50 disabled:hover:bg-white disabled:hover:shadow-none disabled:hover:translate-y-0"
                  disabled
                >
                  Previous
                </button>
                <button
                  className="px-3 py-1 text-sm border rounded-sm text-gray-500 hover:bg-gray-50 transition-all duration-200 hover:shadow-xs hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50 disabled:hover:bg-white disabled:hover:shadow-none disabled:hover:translate-y-0"
                  disabled
                >
                  Next
                </button>
              </div>
            </div> */}
          </div>
        </section>
      )}
    </div>
  );
}

export default PatientMedicalRecords;
