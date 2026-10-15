# Authentication with Zitadel

LungVisionAI signs users in with [Zitadel](https://zitadel.com) (self-hosted, v4.19.4) instead of AWS Cognito.

- **Password login and SSO** both happen on Zitadel's login page. The frontend uses the OIDC authorization code flow with PKCE (`oidc-client-ts`); the backend never sees passwords at login.
- **The backend verifies JWT access tokens** against Zitadel's signing keys and authorizes each route by scope.
- **Doctor sign-up stays in the app** (`/register`). The backend creates the Zitadel user and grants the doctor scopes. Zitadel's own self-registration is disabled.

## Running it locally

`docker compose up --build` from `src/` starts everything. On the first start, `zitadel-bootstrap` configures Zitadel and writes the IDs the backend needs to the `lungvision-auth` volume. It is safe to re-run: `docker compose run --rm zitadel-bootstrap`.

| URL | What |
| --- | --- |
| http://localhost:3000 | App |
| http://localhost:8080/ui/console | Zitadel console, `admin@lungvisionai.localhost` / `LungVision-Admin1!` |
| http://localhost:5556 | Dev-only mock SSO provider |

The browser must reach ports **3000, 5001, 8080 and 5556** on `localhost`. On a remote dev box (Coder, Codespaces), forward all four. Zitadel only answers on the host name it was started with (`HOST` in `src/.env`).

### Test accounts

- **Doctor (password):** register at http://localhost:3000/register, then sign in.
- **Doctor (SSO):** click *Sign in with Google* on the app's sign-in page; it goes straight to the configured SSO provider, which locally is the mock. Type any username on the mock's page (e.g. `dr.sso`). The first SSO sign-in creates the Zitadel user, and the backend grants the doctor scopes.
- **Patient:** doctors create patients from the patient list. Patients get no password, so they cannot sign in until one is set (Zitadel console, *Users*).

### Resetting

Zitadel applies its first-instance settings (admin user, tokens) only to an empty database. To start over:

```bash
docker compose rm -sf zitadel zitadel-db zitadel-login zitadel-proxy zitadel-sso-mock zitadel-bootstrap backend
docker volume rm src_zitadel-db-data src_zitadel-bootstrap src_zitadel-admin src_lungvision-auth
docker compose up -d
```

## Doctor and patient scopes

Scopes are Zitadel project roles, kept apart by prefix (and by role group in the console). They are defined in [`backend/scopes.py`](../backend/scopes.py) and created by the bootstrap.

| Scope | Allows |
| --- | --- |
| `doctor:patients:read` | List own patients, view their profiles |
| `doctor:patients:write` | Create patients, edit own patients |
| `doctor:records:read` | View records, prescriptions, X-ray download URLs |
| `doctor:records:write` | Create/edit records and prescriptions, run predictions, upload X-rays |
| `patient:profile:read` | View own profile |
| `patient:records:read` | View own records |

Routes declare what they need with `@requires_scopes(...)` or, for routes patients may also use on their own data, `@requires_doctor_or_own_patient_scope(...)` (see [`decorators/login_required.py`](../backend/decorators/login_required.py)). Doctors can only reach their own `/doctors/<id>` routes and their own patients' profiles.

The role of a user who signs in through SSO for the first time is set by `ZITADEL_SSO_DEFAULT_ROLE` on the backend: `doctor` (default), `patient` or `none`. It is granted once; removing it later in the console is not undone.

## Configuring a real SSO provider

The bootstrap registers one generic OIDC provider from these variables (set them in `src/.env`, then re-run the bootstrap):

```bash
SSO_OIDC_NAME="Hospital SSO"
SSO_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0   # Entra ID; Google: https://accounts.google.com
SSO_OIDC_CLIENT_ID=...
SSO_OIDC_CLIENT_SECRET=...
```

Register `http://localhost:8080/idps/callback` (your Zitadel URL + `/idps/callback`) as the redirect URI at the provider. The provider must send `given_name` and `family_name`: Zitadel creates the account automatically only when both are present. Without them, users land on a "complete your data" form that is blocked because self-registration is off. Set `SSO_OIDC_ISSUER=` (empty) to drop the dev mock. A provider the bootstrap added earlier stays until you remove it in the console (*Organization → Identity Providers*).

## Configuration reference

Backend (environment, or the file written by the bootstrap via `ZITADEL_CONFIG_FILE`):

| Variable | Meaning |
| --- | --- |
| `ZITADEL_ISSUER` | Public Zitadel URL; must match the `iss` claim of tokens |
| `ZITADEL_API_URL` | URL the backend calls Zitadel on (defaults to the issuer) |
| `ZITADEL_ORGANIZATION_ID`, `ZITADEL_PROJECT_ID`, `ZITADEL_CLIENT_ID` | IDs created by the bootstrap |
| `ZITADEL_SERVICE_USER_TOKEN` | Token of the `lungvision-backend` service user (`ORG_USER_MANAGER`) |
| `ZITADEL_SSO_DEFAULT_ROLE` | `doctor`, `patient` or `none` |

The frontend reads its OIDC settings from `GET /oauth/config` on the backend, so its build has no Zitadel settings.
