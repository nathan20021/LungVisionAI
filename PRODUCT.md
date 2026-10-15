# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Clinicians: physicians, radiologists and nurses at hospitals and clinics. They create their own accounts through the public sign-up form, then manage their own patient list. Patients are added by their clinician and never sign in or sign up.

The core job: upload a patient's chest X-ray, get an AI read of it (regions, conditions with confidence, a written impression and findings), check that read against the image, then save it to the patient's record with clinical notes, a treatment plan, priority and prescriptions.

## Product Purpose

LungVision AI gives clinicians a second read of a chest X-ray. It localises anatomical regions on the image, scores conditions per region, and drafts a radiology-style report. The clinician stays the decision maker: success means a clinician reaches a reviewed, saved record faster and with fewer misses than reading alone.

## Positioning

The AI read is anchored to the image itself: every condition score belongs to a segmented region the clinician can select on the X-ray, and flags are driven by a confidence threshold the clinician sets. It is a reviewable overlay, not a black-box verdict.

## Operating Context

- Pilot with real clinics. Real clinicians use it, so every AI output must read as AI-assisted and needing review before anyone acts on it.
- Sign-in and SSO happen on a hosted Zitadel login page (OIDC redirect). The app's own sign-up form creates the account (email, name, occupation, organization, location, password).
- Records are created in two steps: (1) record details and X-ray upload, (2) review of the AI analysis, then save.
- X-rays arrive as JPG/PNG/GIF or DICOM (`.dcm`). DICOM is converted to JPEG in the browser before upload.
- Analysis time is unknown and may vary (cold starts are possible). Any waiting state must work for both a short and a long wait.

## Capabilities and Constraints

- Analysis = two backend calls on the uploaded image URL: prediction + report, and segmentation boxes.
- Priorities: Low, Medium, High (legacy records may carry Emergency).
- Alert threshold for flagging a condition is chosen per browser (30–90%, default 50%).
- Stack: React 19, React Router 7, Tailwind CSS 4, Vite, react-icons. No animation library is installed.

## Brand Commitments

- Name: LungVision AI.
- Existing palette anchors: primary teal `#3c7187`, secondary blue `#68b0e7`, error `#d23955`.
- Flagged findings are shown in red throughout the record view. The user chose this red treatment as the standard for AI results.

## Evidence on Hand

- `src/frontend/public/pneumothorax-xray.jpg`: a de-identified pneumothorax chest X-ray, shown on the sign-in page with the model's real output for it.
- No customer names, testimonials, accuracy figures or regulatory claims exist. Do not invent any.

## Product Principles

1. The clinician decides. The AI proposes, the clinician reviews, nothing is final until they save.
2. Anchor every AI claim to the image. Findings point back to a region the clinician can see.
3. Never leave the clinician waiting blind. Long-running work runs in the background and shows honest status.
4. One way of showing a record. A record being created looks like the record it will become.

## Accessibility & Inclusion

Clinical setting: flags must not rely on color alone (icon plus text alongside red), and confidence values are always shown as numbers. Respect reduced-motion preferences.
