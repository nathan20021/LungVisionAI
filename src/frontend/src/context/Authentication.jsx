import { createContext, useState, useEffect, useContext, useCallback } from "react";
import { signUp, getSelfUser } from "../services/api";
import { getUserManager } from "../services/auth";
import { useNavigate } from "react-router-dom";

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Load the app profile for a signed-in user. The backend grants first-time
  // SSO users their default role; refresh the token so it carries the new scopes.
  const loadSession = useCallback(async (oidcUser) => {
    let profile = await getSelfUser(oidcUser.access_token);
    if (profile.token_refresh_required) {
      const userManager = await getUserManager();
      oidcUser = await userManager.signinSilent();
      profile = await getSelfUser(oidcUser.access_token);
    }
    setToken(oidcUser.access_token);
    setUser(profile);
  }, []);

  // Restore an existing session on mount and keep the token current as it renews
  useEffect(() => {
    let userManager;
    const onUserLoaded = (oidcUser) => setToken(oidcUser.access_token);
    const onUserUnloaded = () => {
      setToken(null);
      setUser(null);
    };

    getUserManager()
      .then(async (manager) => {
        userManager = manager;
        userManager.events.addUserLoaded(onUserLoaded);
        userManager.events.addUserUnloaded(onUserUnloaded);

        let oidcUser = await userManager.getUser();
        if (oidcUser?.expired) {
          oidcUser = await userManager
            .signinSilent()
            .catch(() => userManager.removeUser().then(() => null));
        }
        if (oidcUser) {
          await loadSession(oidcUser);
        }
      })
      .catch((error) => console.error("Could not restore session:", error))
      .finally(() => setLoading(false));

    return () => {
      if (userManager) {
        userManager.events.removeUserLoaded(onUserLoaded);
        userManager.events.removeUserUnloaded(onUserUnloaded);
      }
    };
  }, [loadSession]);

  // Sends the browser to the Zitadel login page (password or SSO)
  const login = async (loginHint) => {
    const userManager = await getUserManager();
    await userManager.signinRedirect(loginHint ? { login_hint: loginHint } : undefined);
  };

  // Called on /callback when Zitadel redirects back
  const completeLogin = useCallback(async () => {
    const userManager = await getUserManager();
    const oidcUser = await userManager.signinRedirectCallback();
    await loadSession(oidcUser);
    navigate("/patients", { replace: true });
  }, [loadSession, navigate]);

  const register = async (email, password, userDetails) => {
    try {
      await signUp(email, password, userDetails);
      return true;
    } catch (error) {
      console.error("Registration failed:", error);
      const data = error.response?.data;
      throw new Error(data?.message || data?.error || "Registration failed");
    }
  };

  // Ends the Zitadel session too, then Zitadel sends the browser back to "/"
  const logout = async () => {
    const userManager = await getUserManager();
    setToken(null);
    setUser(null);
    try {
      await userManager.signoutRedirect();
    } catch (error) {
      console.error("Logout failed:", error);
      await userManager.removeUser();
      navigate("/");
    }
  };

  const isAuthenticated = () => {
    return !!token;
  };

  const getToken = () => {
    return token;
  };

  const value = {
    user,
    token,
    login,
    completeLogin,
    register,
    logout,
    isAuthenticated,
    getToken,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
