import _ from "lodash";
import React, { useState, useEffect } from "react";
import TopBar from "../components/TopBar";
import PatientInfo from "../components/Patient/PatientInfo";
import PatientMedicalRecords from "../components/Patient/PatientMedicalRecords";
import { useParams } from "react-router-dom";
import { getPatientById } from "../services/api";
import { useAuth } from "../context/Authentication";

function PatientDetailsPage() {
  const { id: patientId } = useParams();
  const { token } = useAuth();
  const [patient, setPatient] = useState({});

  useEffect(() => {
    getPatientById(patientId, token).then((data) => setPatient(data));
  }, [patientId, token]);

  return (
    <div className="flex-1 flex flex-col h-screen">
      <TopBar />
      <div className="flex-1 bg-gray-100 p-6 overflow-auto">
        {!_.isEmpty(patient) && (
          <div className="bg-white rounded-lg shadow-xs mb-6">
            <PatientInfo patient={patient} />
            <PatientMedicalRecords patient={patient} />
          </div>
        )}
      </div>
    </div>
  );
}

export default PatientDetailsPage;
