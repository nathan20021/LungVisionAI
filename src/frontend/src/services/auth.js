import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { getAuthConfig } from "./api";

let settingsPromise = null;

// Login runs against Zitadel (OIDC authorization code + PKCE). The Zitadel URL,
// client id and scopes come from the backend, so the frontend build doesn't
// need to know which Zitadel instance it talks to.
// ssoScope, when an SSO provider is configured, makes Zitadel send the browser
// straight to that provider instead of its own login page.
export const getAuthSettings = () => {
  if (!settingsPromise) {
    settingsPromise = getAuthConfig().then((config) => ({
      userManager: new UserManager({
        authority: config.authority,
        client_id: config.client_id,
        scope: config.scope,
        redirect_uri: `${window.location.origin}/callback`,
        post_logout_redirect_uri: `${window.location.origin}/`,
        response_type: "code",
        automaticSilentRenew: true,
        userStore: new WebStorageStateStore({ store: window.localStorage }),
      }),
      ssoScope: config.sso_idp_id ? `urn:zitadel:iam:org:idp:id:${config.sso_idp_id}` : null,
    }));
    // let the next caller retry if the backend was unreachable
    settingsPromise.catch(() => {
      settingsPromise = null;
    });
  }
  return settingsPromise;
};

export const getUserManager = () => getAuthSettings().then((settings) => settings.userManager);
