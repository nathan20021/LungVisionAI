---
version: 1
slug: "src-frontend-src-pages-loginpage-jsx"
primary_target: "src/frontend/src/pages/LoginPage.jsx"
related_targets: ["src/frontend/src/App.jsx"]
---

# Sign in and create account

Scope: `/login` and `/register`, one surface. Visitor mode: Operate. Audience: clinicians (physicians, radiologists, nurses). Job: return and sign in through the hosted Zitadel page, or create an account (email, name, occupation, organization, location, password). Patients never sign in or sign up.

Constraints: sign-in is an OIDC redirect, so the only in-app sign-in input is an optional email passed as login_hint. Keep the existing palette (teal #3c7187, X-ray panel #0e1518) and DM Sans.

## Direction contract

THESIS: one surface for both modes, opened by the product's own mechanism, findings anchored to regions on an X-ray. It refuses the stock centered card on a grey ground and the gradient brand half.

OWN-WORLD: the record view's dark radiograph panel (#0e1518, #9fb3bd text) beside a white work area. Teal primary actions, dashed white region boxes, one red flagged box with a red-50 tag.

STORY: the clinician sees what the product does, signs in or creates an account without leaving the page, and the email they type carries across modes.

FIRST VIEWPORT: left half dark panel with the wordmark top left, the sample X-ray centred with regions tracing in and one flagged tag, the caption bottom left labelled as a sample. Right half: a segmented control (Sign in / Create account) above the active pane, the primary button full width, the patients note below.

FORM: split with live radiograph, third of three dealt structures, seed:0b0ed3c008fa0453.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
