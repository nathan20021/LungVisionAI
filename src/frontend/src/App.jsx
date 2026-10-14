import React from "react";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import {
  Routes,
  Route,
  useNavigate,
  useParams,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/Authentication";
import { ProtectedRoute } from "./components/ProtectedRoute";
// import DashboardPage from "./pages/DashboardPage";
import PatientsPage from "./pages/PatientsPage";
import SettingsPage from "./pages/SettingPage";
import PatientDetailsPage from "./pages/PatientDetailsPage";
import ViewMedicalRecord from "./components/Patient/ViewMedicalRecord";

function MedicalRecordPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="h-full overflow-auto bg-white">
      <ViewMedicalRecord
        userId={user?.id}
        recordId={id}
        onBack={() => navigate(-1)}
      />
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  return (
    <AuthProvider>
      <div className="bg-[#e1e1e1] w-screen h-screen overflow-hidden">
        <Routes>
          <Route index element={<LoginPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="callback" element={<AuthCallbackPage />} />
          <Route
            path="settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="patients"
            element={
              <ProtectedRoute>
                <PatientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="patients/:id"
            element={
              <ProtectedRoute>
                <PatientDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="patients/:id/create-record"
            element={
              <ProtectedRoute>
                <PatientDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medical-records/:id"
            element={
              <ProtectedRoute>
                <MedicalRecordPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
          {/* Redirect all unknown path to Home Page */}
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;
