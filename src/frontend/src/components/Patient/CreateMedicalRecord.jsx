import React, { useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa";
import { uploadFile } from "../../services/api";
import { useAuth } from "../../context/Authentication";
import { dicomToJpeg } from "../../services/dicom";

function CreateMedicalRecord({ onBack, onAnalyze }) {
  const { token } = useAuth();
  const [file, setFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [record, setRecord] = useState({
    note: "",
    treatmentPlan: "",
    priority: "Low",
    prescriptions: [],
  });

  const handleFileChange = async (file) => {
    setUploadError("");
    try {
      // DICOM files are converted to JPEG in the browser before uploading
      const upload = file?.name?.toLowerCase().endsWith(".dcm")
        ? await dicomToJpeg(file)
        : file;
      setFile(upload);
      const imageURL = await uploadFile(upload, token);
      setRecord((prev) => ({ ...prev, xRayUrl: imageURL }));
    } catch (error) {
      console.error("Error uploading file:", error);
      setUploadError(error.message || "This file could not be uploaded.");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setRecord((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePrescriptionChange = (id, field, value) => {};

  const addPrescriptionRow = () => {};

  const removePrescriptionRow = (id) => {};

  return (
    <div className="p-6">
      {/* Header */}

      {/* Steps Indicator */}
      <div className="flex items-center max-w-2xl mx-auto">
        <div className="flex-1 flex items-center">
          <div className="flex-none">
            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-medium text-lg">
              1
            </div>
          </div>
          <div className="flex-1 h-1 bg-primary"></div>
        </div>
        <div className="flex-1 flex items-center">
          <div className="flex-1 h-1 bg-gray-200"></div>
          <div className="flex-none">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 text-gray-400 flex items-center justify-center font-medium text-lg">
              2
            </div>
          </div>
        </div>
      </div>
      <div className="flex max-w-2xl mx-auto mt-2">
        <div className="flex-1 text-center">
          <p className="font-medium text-primary">Record Details</p>
          <p className="text-sm text-gray-500">Enter medical information</p>
        </div>
        <div className="flex-1 text-center">
          <p className="font-medium text-gray-400">AI Analysis</p>
          <p className="text-sm text-gray-500">Review AI findings</p>
        </div>
      </div>

      {/* Form Content */}
      <div className="mt-12 px-8">
        <div className="grid grid-cols-2 gap-8">
          {/* Left Column - File Upload */}
          <div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Upload X-Ray Image
              </label>
              <div className="flex flex-col justify-center items-center gap-3 border-2 border-dashed border-gray-300 rounded-lg p-10 hover:border-gray-400 transition-colors bg-gray-50">
                {file ? (
                  <div className="w-full aspect-square relative">
                    <img
                      src={URL.createObjectURL(file)}
                      alt="Uploaded X-Ray"
                    />
                    <button
                      onClick={() => setFile(null)}
                      className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-md hover:bg-gray-100"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    <img
                      src="/file-upload.png"
                      alt="file upload icon"
                      className="w-20 h-20 object-contain"
                    />
                    <p className="text-gray-600 font-medium">
                      Drag & Drop X-Ray here
                    </p>
                    <div className="relative w-32 flex items-center justify-center my-2">
                      <div className="absolute w-full h-px bg-gray-300"></div>
                      <span className="bg-gray-50 px-2 text-gray-500 text-sm">
                        or
                      </span>
                    </div>
                    <input
                      type="file"
                      accept=".jpg,.png,.gif,.dcm"
                      onChange={(e) => handleFileChange(e.target.files[0])}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="text-primary border border-primary px-4 py-2 rounded-sm hover:bg-primary hover:text-white transition-colors cursor-pointer"
                    >
                      Browse Files
                    </label>
                  </>
                )}
              </div>
              {uploadError && (
                <p className="text-error text-sm mt-2">{uploadError}</p>
              )}
            </div>
          </div>
          <div className="space-y-6">
            {/* Priority Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <select
                name="priority"
                value={record.priority}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#3C7187] focus:border-transparent disabled:bg-gray-50"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            {/* Clinical Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Clinical Notes
              </label>
              <textarea
                name="note"
                value={record.note}
                onChange={handleInputChange}
                rows={4}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#3C7187] focus:border-transparent disabled:bg-gray-50"
                placeholder="Enter clinical notes..."
              />
            </div>

            {/* Treatment Plan */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Treatment Plan
              </label>
              <textarea
                name="treatmentPlan"
                value={record.treatmentPlan}
                onChange={handleInputChange}
                rows={4}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#3C7187] focus:border-transparent disabled:bg-gray-50"
                placeholder="Enter treatment plan..."
              />
            </div>

            {/* Prescriptions Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Prescriptions
                </label>
                <button
                  onClick={addPrescriptionRow}
                  className="flex items-center gap-2 text-sm text-primary hover:text-[#2c5465]"
                >
                  <FaPlus className="text-xs" />
                  Add Medication
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                        Medication
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                        Dosage
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                        Frequency
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                        Time
                      </th>
                      <th className="px-4 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {record.prescriptions.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={row.medication}
                            onChange={(e) =>
                              handlePrescriptionChange(
                                row.id,
                                "medication",
                                e.target.value
                              )
                            }
                            className="w-full border-0 focus:ring-0"
                            placeholder="Enter medication"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={row.dosage}
                            onChange={(e) =>
                              handlePrescriptionChange(
                                row.id,
                                "dosage",
                                e.target.value
                              )
                            }
                            className="w-full border-0 focus:ring-0"
                            placeholder="Enter dosage"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={row.dosageFrequency}
                            onChange={(e) =>
                              handlePrescriptionChange(
                                row.id,
                                "dosageFrequency",
                                e.target.value
                              )
                            }
                            className="w-full border-0 focus:ring-0"
                            placeholder="Enter frequency"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={row.time}
                            onChange={(e) =>
                              handlePrescriptionChange(
                                row.id,
                                "time",
                                e.target.value
                              )
                            }
                            className="w-full border-0 focus:ring-0"
                            placeholder="Enter time"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => removePrescriptionRow(row.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <FaTrash className="text-sm" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4 mt-8">
        <button
          onClick={async () => {
            await onAnalyze({
              ...record,
              file: file,
              prescriptions: record.prescriptions,
            });
          }}
          className="px-6 py-2.5 bg-primary text-white rounded-md hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-none font-medium"
        >
          Continue to Analysis
        </button>
        <button
          onClick={onBack}
          className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default CreateMedicalRecord;
