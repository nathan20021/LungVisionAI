import React, { useState } from "react";
import { PrimaryButton, SecondaryButton } from "../components/Buttons";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../context/Authentication";

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [error, setError] = useState("");

  // Password and SSO sign-in both happen on the Zitadel login page
  const handleLogin = async () => {
    try {
      setError("");
      await login();
    } catch (error) {
      setError(error.message || "Login failed. Please try again.");
      console.error("Login failed:", error);
    }
  };

  // Redirect to the patients page if already authenticated
  if (isAuthenticated()) {
    return <Navigate to="/patients" replace />;
  }

  return (
    <div className="w-full h-full flex justify-center items-center">
      <div className="w-[70%] h-[60%] max-w-[1100px] bg-white flex">
        <div className="h-full w-1/2 flex justify-center items-center">
          <div
            id="login-form"
            className="w-4/5 h-4/5 flex flex-col justify-center gap-8"
          >
            <h1 className="text-4xl font-light">Sign In</h1>
            <p className="text-gray-600">
              Sign in with your LungVision AI password or your organization's
              single sign-on.
            </p>
            {error && <div className="text-error text-sm">{error}</div>}
            <PrimaryButton text="Sign In" onClick={handleLogin} />
          </div>
        </div>
        <div className="h-full w-1/2 bg-linear-to-br from-primary to-[#00B6AD] flex flex-col items-center justify-center gap-4">
          <h1 className="text-white text-4xl font-medium">LungVision AI</h1>
          <h4 className="text-white">Don't have an account?</h4>
          <Link to="/register">
            <SecondaryButton text="Sign Up" onClick={() => void 0} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
