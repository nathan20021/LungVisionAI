import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { getAuthConfig } from "./api";

let userManagerPromise = null;

// Login runs against Zitadel (OIDC authorization code + PKCE). The Zitadel URL,
// client id and scopes come from the backend, so the frontend build doesn't
// need to know which Zitadel instance it talks to.
export const getUserManager = () => {
  if (!userManagerPromise) {
    userManagerPromise = getAuthConfig().then(
      (config) =>
        new UserManager({
          authority: config.authority,
          client_id: config.client_id,
          scope: config.scope,
          redirect_uri: `${window.location.origin}/callback`,
          post_logout_redirect_uri: `${window.location.origin}/`,
          response_type: "code",
          automaticSilentRenew: true,
          userStore: new WebStorageStateStore({ store: window.localStorage }),
        })
    );
    // let the next caller retry if the backend was unreachable
    userManagerPromise.catch(() => {
      userManagerPromise = null;
    });
  }
  return userManagerPromise;
};
