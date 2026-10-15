import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { getAuthConfig } from "./api";

let userManagerPromise = null;
// the SSO provider's Zitadel id, once the config has loaded; null without SSO
let ssoProviderId = null;

// Login runs against Zitadel (OIDC authorization code + PKCE). The Zitadel URL,
// client id and scopes come from the backend, so the frontend build doesn't
// need to know which Zitadel instance it talks to.
export const getUserManager = () => {
  if (!userManagerPromise) {
    userManagerPromise = getAuthConfig().then((config) => {
      ssoProviderId = config.sso_idp_id || null;
      return new UserManager({
        authority: config.authority,
        client_id: config.client_id,
        scope: config.scope,
        redirect_uri: `${window.location.origin}/callback`,
        post_logout_redirect_uri: `${window.location.origin}/`,
        response_type: "code",
        automaticSilentRenew: true,
        userStore: new WebStorageStateStore({ store: window.localStorage }),
      });
    });
    // let the next caller retry if the backend was unreachable
    userManagerPromise.catch(() => {
      userManagerPromise = null;
    });
  }
  return userManagerPromise;
};

// Asking Zitadel for this scope sends the browser straight to the SSO provider
// instead of Zitadel's own login page. Null until getUserManager has resolved.
export const getSsoScope = () =>
  ssoProviderId && `urn:zitadel:iam:org:idp:id:${ssoProviderId}`;
