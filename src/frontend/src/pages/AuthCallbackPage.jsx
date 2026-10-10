import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/Authentication";

// Zitadel redirects here after sign-in with a one-time authorization code
function AuthCallbackPage() {
  const { completeLogin } = useAuth();
  const [error, setError] = useState("");
  const handled = useRef(false);

  useEffect(() => {
    // React StrictMode runs effects twice in development; the code is single-use
    if (handled.current) return;
    handled.current = true;
    completeLogin().catch((error) => {
      console.error("Login failed:", error);
      setError(error.message || "Login failed. Please try again.");
    });
  }, [completeLogin]);

  return (
    <div className="w-full h-full flex justify-center items-center">
      <div className="bg-white p-10 flex flex-col items-center gap-4">
        {error ? (
          <>
            <div className="text-error text-sm">{error}</div>
            <Link to="/login" className="text-primary font-bold">
              Back to sign in
            </Link>
          </>
        ) : (
          <div>Signing you in...</div>
        )}
      </div>
    </div>
  );
}

export default AuthCallbackPage;
