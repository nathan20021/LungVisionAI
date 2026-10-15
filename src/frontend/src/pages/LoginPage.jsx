import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { FiAlertTriangle, FiCheck } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";

import { useAuth } from "../context/Authentication";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// What the LungVision model returned for /pneumothorax-xray.jpg (a de-identified
// pneumothorax case). Boxes are in % of the image: left, top, width, height.
const CASE_REGIONS = [
  [11.9, 11.9, 32.5, 32.4], // right upper lung zone
  [49.7, 12.2, 28.7, 33.5], // left upper lung zone
  [35.0, 57.4, 36.0, 35.5], // cardiac silhouette
  [3.7, 63.1, 38.2, 33.3], // right lower lung zone
  [52.0, 64.7, 36.1, 35.2], // left lower lung zone
];
const CASE_FINDING = {
  region: "Right apical zone",
  condition: "Pneumothorax",
  confidence: "53.7%",
  box: [16.7, 9.9, 27.4, 18.8],
};

const MODES = ["Sign in", "Create account"];
const SIGN_UP_STEPS = ["About you", "Your practice", "Password"];

const PRIMARY_BUTTON =
  "h-11 w-full rounded-lg bg-primary px-4 font-semibold text-white transition hover:bg-[#2c5465] active:scale-[0.97] disabled:opacity-60";
const SECONDARY_BUTTON =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[0.97]";
// Panes slide on a critically damped spring; reduced motion swaps instantly
const SLIDE = "duration-[450ms] ease-spring motion-reduce:transition-none";

// Height of refs.current[index], kept current while it resizes
const useHeightOf = (refs, index) => {
  const [height, setHeight] = useState();
  useLayoutEffect(() => {
    const element = refs.current[index];
    if (!element) return;
    const update = () => setHeight(element.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [refs, index]);
  return height;
};

const Field = ({ label, ...input }) => {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        {...input}
        className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-[15px] text-gray-900 transition placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/20"
      />
    </div>
  );
};

function SignInPane({ email, setEmail }) {
  const { login, ssoAvailable } = useAuth();
  const [error, setError] = useState("");
  // which button started the redirect: "password" or "sso"
  const [redirecting, setRedirecting] = useState(null);

  // Password sign-in happens on the Zitadel login page, which the email
  // pre-fills; SSO goes straight to the SSO provider
  const signIn = async (method) => {
    setError("");
    setRedirecting(method);
    try {
      await login(method === "sso" ? undefined : email.trim() || undefined, {
        sso: method === "sso",
      });
    } catch (error) {
      console.error("Login failed:", error);
      setError("Sign-in could not start. Check your connection and try again.");
      setRedirecting(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    signIn("password");
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {ssoAvailable
            ? "Use your LungVision password, or sign in with Google."
            : "Use your LungVision password."}
        </p>
      </div>
      <Field
        label="Work email"
        type="email"
        autoComplete="email"
        placeholder="jane.doe@hospital.org"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <button type="submit" disabled={!!redirecting} className={PRIMARY_BUTTON}>
        {redirecting === "password" ? "Opening sign-in…" : "Continue"}
      </button>
      <p className="text-center text-[13px] text-gray-500">
        Next, you'll enter your password.
      </p>
      {ssoAvailable && (
        <>
          <div className="flex items-center gap-3 text-[13px] text-gray-500" aria-hidden="true">
            <span className="h-px flex-1 bg-gray-200" />
            or
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <button
            type="button"
            onClick={() => signIn("sso")}
            disabled={!!redirecting}
            className={`${SECONDARY_BUTTON} inline-flex items-center justify-center gap-2.5 disabled:opacity-60`}
          >
            <FcGoogle className="h-5 w-5" aria-hidden="true" />
            {redirecting === "sso" ? "Opening Google…" : "Sign in with Google"}
          </button>
        </>
      )}
    </form>
  );
}

function SignUpPane({ email, setEmail }) {
  const { register, login } = useAuth();
  // 0-2 are the form steps, 3 is the confirmation
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    occupation: "",
    organization: "",
    location: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const stepRefs = useRef([]);
  const stepHeight = useHeightOf(stepRefs, step);

  const bind = (name) => ({
    value: form[name],
    onChange: (e) => setForm((current) => ({ ...current, [name]: e.target.value })),
  });

  const goTo = (next) => {
    setError("");
    setStep(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // the email is shared with the sign-in pane, so it can change after step 1
    if (!EMAIL_PATTERN.test(email.trim())) {
      goTo(0);
      setError("Enter a valid work email, like jane.doe@hospital.org.");
      return;
    }
    if (step < 2) return goTo(step + 1);
    if (!form.password) return setError("Choose a password.");
    if (form.password !== form.confirmPassword) {
      return setError("The passwords don't match.");
    }

    setError("");
    setSubmitting(true);
    try {
      await register(email.trim(), form.password, {
        first_name: form.firstName,
        last_name: form.lastName,
        occupation: form.occupation,
        organization: form.organization,
        location: form.location,
      });
      setStep(3);
    } catch (error) {
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const name = [form.firstName, form.lastName].filter(Boolean).join(" ");
  const steps = [
    <>
      <Field
        label="Work email"
        type="email"
        autoComplete="email"
        placeholder="jane.doe@hospital.org"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" autoComplete="given-name" placeholder="Jane" {...bind("firstName")} />
        <Field label="Last name" autoComplete="family-name" placeholder="Doe" {...bind("lastName")} />
      </div>
    </>,
    <>
      <Field label="Occupation" autoComplete="organization-title" placeholder="Respiratory physician" {...bind("occupation")} />
      <Field label="Organization" autoComplete="organization" placeholder="Toronto General Hospital" {...bind("organization")} />
      <Field label="Location" autoComplete="address-level2" placeholder="Toronto, Ontario" {...bind("location")} />
    </>,
    <>
      <Field label="Password" type="password" autoComplete="new-password" {...bind("password")} />
      <Field label="Confirm password" type="password" autoComplete="new-password" {...bind("confirmPassword")} />
    </>,
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Create your account
        </h1>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium tabular-nums text-gray-600">
            {step < 3
              ? `Step ${step + 1} of 3 · ${SIGN_UP_STEPS[step]}`
              : "Account created"}
          </p>
          <span className="flex gap-1" aria-hidden="true">
            {SIGN_UP_STEPS.map((label, i) => (
              <span
                key={label}
                className={`h-1 w-5 rounded-full transition-colors duration-300 ${
                  i <= step ? "bg-primary" : "bg-gray-200"
                }`}
              />
            ))}
          </span>
        </div>
      </div>

      <div
        className={`-m-1 overflow-hidden p-1 transition-[height] ${SLIDE}`}
        style={{ height: stepHeight && stepHeight + 8 }}
      >
        <div
          className={`flex items-start transition-transform ${SLIDE}`}
          style={{ transform: `translateX(${-100 * step}%)` }}
        >
          {steps.map((fields, i) => (
            <fieldset
              key={SIGN_UP_STEPS[i]}
              ref={(element) => (stepRefs.current[i] = element)}
              inert={i !== step}
              className="grid min-w-0 flex-[0_0_100%] gap-3.5 px-1"
            >
              <legend className="sr-only">{SIGN_UP_STEPS[i]}</legend>
              {fields}
            </fieldset>
          ))}
          <div
            ref={(element) => (stepRefs.current[3] = element)}
            inert={step !== 3}
            className="grid min-w-0 flex-[0_0_100%] justify-items-center gap-2 px-1 py-2 text-center"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#e7f0f3] text-primary">
              <FiCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-lg font-semibold tracking-tight text-gray-900">
              {name ? `Welcome, ${name}` : "Welcome to LungVision AI"}
            </p>
            <p className="max-w-[30ch] text-sm text-gray-600">
              Your account is ready. Sign in to start reviewing X-rays.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {step < 3 ? (
        <div className="flex gap-2.5">
          {step > 0 && (
            <button type="button" onClick={() => goTo(step - 1)} className={SECONDARY_BUTTON}>
              Back
            </button>
          )}
          <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
            {step < 2 ? "Continue" : submitting ? "Creating account…" : "Create account"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => login(email.trim())} className={PRIMARY_BUTTON}>
          Sign in
        </button>
      )}
    </form>
  );
}

function SampleRadiograph() {
  const box = ([left, top, width, height]) => ({
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  });
  return (
    <figure className="m-0 flex items-center gap-4 lg:flex-1 lg:flex-col lg:items-stretch">
      <div className="relative aspect-square w-16 shrink-0 lg:my-auto lg:w-[min(340px,66%)] lg:self-center">
        <img
          src="/pneumothorax-xray.jpg"
          alt="Chest X-ray of a pneumothorax, with the region the model flagged outlined"
          className="block h-full w-full rounded"
        />
        {CASE_REGIONS.map((region, i) => (
          <span
            key={region.join()}
            aria-hidden="true"
            className="absolute hidden rounded-sm border border-dashed border-white/35 motion-safe:animate-box-in lg:block"
            style={{ ...box(region), animationDelay: `${200 + i * 160}ms` }}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute hidden rounded-sm border-[1.5px] border-red-400 bg-red-400/15 motion-safe:animate-box-in lg:block"
          style={{ ...box(CASE_FINDING.box), animationDelay: "1000ms" }}
        />
        <span
          aria-hidden="true"
          className="absolute left-[-5%] top-[31%] hidden gap-0.5 whitespace-nowrap rounded-md bg-red-50 px-2 py-1 text-[11.5px] text-red-800 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.6)] motion-safe:animate-box-in lg:grid"
          style={{ animationDelay: "1400ms" }}
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <FiAlertTriangle className="h-3 w-3" />
            {CASE_FINDING.condition} · {CASE_FINDING.confidence}
          </span>
          <span className="pl-[18px] font-medium text-red-700">
            {CASE_FINDING.region}
          </span>
        </span>
      </div>
      <figcaption className="grid gap-0.5 text-[15px] font-medium text-[#e6eef1]">
        Every finding sits on a region you can see.
        <span className="text-xs font-normal text-[#8ea6b0]">
          De-identified pneumothorax X-ray, read by the LungVision model
        </span>
      </figcaption>
    </figure>
  );
}

function LoginPage() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const [mode, setMode] = useState(pathname === "/register" ? 1 : 0);
  // typed once, shared by both panes
  const [email, setEmail] = useState("");
  const paneRefs = useRef([]);
  const tabRefs = useRef([]);
  const paneHeight = useHeightOf(paneRefs, mode);

  if (isAuthenticated()) {
    return <Navigate to="/patients" replace />;
  }

  const onTabKeyDown = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = e.key === "ArrowRight" ? 1 : 0;
    setMode(next);
    tabRefs.current[next].focus();
  };

  return (
    <div className="grid h-full w-full overflow-auto bg-white max-lg:grid-rows-[auto_1fr] lg:grid-cols-[1.05fr_1fr]">
      <aside className="flex flex-col gap-4 bg-[#0e1518] px-6 py-5 lg:px-10 lg:py-8">
        <p className="text-base font-bold tracking-tight text-white">
          LungVision AI
        </p>
        <SampleRadiograph />
      </aside>

      <main className="flex items-center justify-center px-6 py-10 lg:px-12">
        <div className="grid w-full max-w-[400px] gap-5">
          <div
            role="tablist"
            aria-label="Account"
            onKeyDown={onTabKeyDown}
            className="relative grid grid-cols-2 rounded-xl bg-[#eef1f3] p-[3px]"
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.12)] transition-transform ${SLIDE}`}
              style={{ transform: `translateX(${mode * 100}%)` }}
            />
            {MODES.map((label, i) => (
              <button
                key={label}
                ref={(element) => (tabRefs.current[i] = element)}
                type="button"
                role="tab"
                id={`account-tab-${i}`}
                aria-selected={mode === i}
                aria-controls={`account-pane-${i}`}
                tabIndex={mode === i ? 0 : -1}
                // switch on press, not release
                onPointerDown={() => setMode(i)}
                onClick={() => setMode(i)}
                className={`relative h-9 rounded-lg text-sm font-semibold transition-colors ${
                  mode === i ? "text-gray-900" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            className={`-m-1 overflow-hidden p-1 transition-[height] ${SLIDE}`}
            style={{ height: paneHeight && paneHeight + 8 }}
          >
            <div
              className={`flex items-start transition-transform ${SLIDE}`}
              style={{ transform: `translateX(${-100 * mode}%)` }}
            >
              {[SignInPane, SignUpPane].map((Pane, i) => (
                <div
                  key={MODES[i]}
                  ref={(element) => (paneRefs.current[i] = element)}
                  id={`account-pane-${i}`}
                  role="tabpanel"
                  aria-labelledby={`account-tab-${i}`}
                  inert={mode !== i}
                  className="min-w-0 flex-[0_0_100%] px-1"
                >
                  <Pane email={email} setEmail={setEmail} />
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[13px] text-gray-500">
            Patients don't need an account. Their clinician adds them.
          </p>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
