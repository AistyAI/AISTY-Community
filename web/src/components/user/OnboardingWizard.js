import { useState, useRef, useCallback, useEffect } from "react";
import { BackIcon, Button, ToastProvider } from '../../ui';
import ModelSettings from '../free/ModelSettings';
import { WorkspaceRoleProvider } from '../utils/WorkspaceRoleContext';
import { CheckIcon } from "../utils/Icons";
import { fetchWithHankoAuth } from "../utils/verifiedCall";
import "../../styles/user/login/login.css";
import "../../styles/user/login/onboarding.css";
import '../../styles/team/team.css';
import GoalsStep from "./onboarding/GoalsStep";
import TicketsStep from "./onboarding/TicketsStep";
import { API_URL } from "../../config";

const PROJECT = "Aisty";

const steps = [
  { id: "companyName", label: "Workspace" },
  { id: "usage", label: "Platform Usage" },
  { id: "goals", label: "Goals" },
  { id: "tickets", label: "Tickets" },
  { id: "model", label: "AI Model" },
];

const USAGE_OPTIONS = [
  "Marketing",
  "HR & Legal",
  "Product Design",
  "Creative",
  "Engineering",
  "Customer Service",
  "Operations",
  "Finance",
  "IT & Support",
  "Manufacturing",
  "Sales & Account",
  "Research",
  "Leadership",
  "Scientist",
];

// Format-level validation (instant, no API call)
const validateNameFormat = (name) => {
  const trimmed = name.trim();
  if (!trimmed) return null; // empty = no message yet
  if (trimmed.length < 2) return "Name must be at least 2 characters.";
  if (trimmed.length > 48) return "Name must be 48 characters or fewer.";
  if (/\s/.test(trimmed)) return "Spaces are not allowed. Use hyphens instead.";
  if (/[^a-zA-Z0-9-]/.test(trimmed)) return "Only letters, numbers, and hyphens are allowed.";
  if (/^-|-$/.test(trimmed)) return "Name cannot start or end with a hyphen.";
  if (/--/.test(trimmed)) return "Name cannot contain consecutive hyphens.";
  return null; // valid format
};

export default function OnboardingWizard() {
  const [step, setStep] = useState(steps[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [nameFormatError, setNameFormatError] = useState("");
  const [nameAvailable, setNameAvailable] = useState(null); // null = unchecked, true/false
  const [nameCheckLoading, setNameCheckLoading] = useState(false);
  const [nameCheckError, setNameCheckError] = useState(""); // server-side "already taken" message
  const debounceRef = useRef(null);

  const [goals, setGoals] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [usage, setUsage] = useState([]);
  const [modelReady, setModelReady] = useState(false);

  const nextStep = (id) => setStep(id);
  const prevStep = () => {
    const idx = steps.findIndex((s) => s.id === step);
    if (idx > 0) setStep(steps[idx - 1].id);
  };

  // Debounced uniqueness check (fires 500ms after user stops typing)
  const checkNameAvailability = useCallback(async (name) => {
    const slug = name.trim().toLowerCase();
    if (!slug || slug.length < 2) {
      setNameAvailable(null);
      setNameCheckError("");
      return;
    }
    setNameCheckLoading(true);
    try {
      const res = await fetchWithHankoAuth(
        `${API_URL}/onboarding/check-name?project=${PROJECT}&name=${encodeURIComponent(slug)}`
      );
      if (res.available) {
        setNameAvailable(true);
        setNameCheckError("");
      } else {
        setNameAvailable(false);
        setNameCheckError(res.reason || "This workspace name is already taken.");
      }
    } catch (err) {
      console.error("[check-name]", err);
      // Don't block the user on network errors; they'll get caught on submit
      setNameAvailable(null);
      setNameCheckError("");
    } finally {
      setNameCheckLoading(false);
    }
  }, []);

  const handleNameChange = (e) => {
    const value = e.target.value;
    setCompanyName(value);
    setError("");

    // Instant format validation
    const formatErr = validateNameFormat(value);
    setNameFormatError(formatErr || "");

    // Reset availability state
    setNameAvailable(null);
    setNameCheckError("");

    // If format is valid, schedule a uniqueness check
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!formatErr && value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        checkNameAvailability(value);
      }, 500);
    }
  };

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleCompanyNameNext = async () => {
    // Format gate
    const formatErr = validateNameFormat(companyName);
    if (formatErr) {
      setError(formatErr);
      return;
    }

    // If we haven't checked yet (e.g. user clicked Continue fast), do it now
    if (nameAvailable === null && !nameCheckLoading) {
      setError("");
      setNameCheckLoading(true);
      try {
        const res = await fetchWithHankoAuth(
          `${API_URL}/onboarding/check-name?project=${PROJECT}&name=${encodeURIComponent(companyName.trim().toLowerCase())}`
        );
        if (!res.available) {
          setError(res.reason || "This workspace name is already taken.");
          setNameAvailable(false);
          setNameCheckError(res.reason || "This workspace name is already taken.");
          return;
        }
        setNameAvailable(true);
        setNameCheckError("");
      } catch (err) {
        console.error("[check-name on continue]", err);
        // Let them proceed on network error; backend will catch duplicates on submit
      } finally {
        setNameCheckLoading(false);
      }
    }

    // Block if known unavailable
    if (nameAvailable === false) {
      setError(nameCheckError || "This workspace name is already taken.");
      return;
    }

    setError("");
    nextStep("usage");
  };

    const handleFinishOnboarding = async () => {
        try {
            setLoading(true);
            setError("");

            // Create the workspace with everything collected so far.
            await fetchWithHankoAuth(`${API_URL}/onboarding/company?project=${PROJECT}`, {
              method: "POST",
              body: JSON.stringify({
                companyName,
                usage,
                goals,
                tickets,
              }),
            });

            setStep("model");
        } catch (err) {
            console.error(err);
            setError(String(err.message || err).replace(/^Failed to fetch [^:]+: /, "") || "Failed to complete onboarding");
        } finally {
            setLoading(false);
        }
    };

  // Goal helpers
  const addGoal = () => setGoals([...goals, { title: "", description: "", target: "" }]);
  const updateGoal = (idx, field, value) => {
    const copy = [...goals];
    copy[idx][field] = value;
    setGoals(copy);
  };
  const removeGoal = (idx) => setGoals(goals.filter((_, i) => i !== idx));

  // Ticket helpers
  const addTicket = () => setTickets([...tickets, { title: "", description: "" }]);
  const updateTicket = (idx, field, value) => {
    const copy = [...tickets];
    copy[idx][field] = value;
    setTickets(copy);
  };
  const removeTicket = (idx) => setTickets(tickets.filter((_, i) => i !== idx));

  const currentIndex = Math.max(steps.findIndex((s) => s.id === step), 0);
  const progress = ((currentIndex + 1) / steps.length) * 100;

  const renderStep = () => {
    switch (step) {
      case "companyName":
        return (
          <div className="onboarding-step">
            <div className="onboarding-title">
              <div>
                <h2>Create your workspace</h2>
                <p>Your company name will be used for your workspace URL. Use letters, numbers, and hyphens only.</p>
              </div>
            </div>
            <label>
              Workspace name
              <input
                placeholder="e.g. acme-corp"
                value={companyName}
                onChange={handleNameChange}
                autoFocus
              />
            </label>

            {/* Real-time format error */}
            {nameFormatError && <div className="error">{nameFormatError}</div>}

            {/* Availability status */}
            {!nameFormatError && nameCheckLoading && (
              <div className="info-text" style={{ color: "var(--text-secondary, #888)", fontSize: 13, marginTop: 4 }}>
                Checking availability…
              </div>
            )}
            {!nameFormatError && !nameCheckLoading && nameAvailable === true && companyName.trim().length >= 2 && (
              <div className="success-text" style={{ color: "var(--success, #22c55e)", fontSize: 13, marginTop: 4, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <CheckIcon width={14} height={14} /> This workspace name is available
              </div>
            )}
            {!nameFormatError && !nameCheckLoading && nameAvailable === false && (
              <div className="error">{nameCheckError}</div>
            )}

            {/* General error (shown on Continue click) */}
            {error && !nameFormatError && nameAvailable !== false && <div className="error">{error}</div>}

            <div className="actions">
              <span />
              <Button
                onClick={handleCompanyNameNext}
                disabled={
                  !companyName.trim() ||
                  !!nameFormatError ||
                  nameAvailable === false ||
                  nameCheckLoading
                }
              >
                {nameCheckLoading ? "Checking…" : "Continue"}
              </Button>
            </div>
          </div>
        );

      case "usage":
        return (
          <div className="onboarding-step">
            <div className="onboarding-title">
              <div>
                <h2>What team are you on?</h2>
                <p>Select your primary department.</p>
              </div>
            </div>

            <div className="pill-grid">
              {USAGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`pill ${usage[0] === option ? "active" : ""}`}
                  onClick={() => setUsage([option])}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="actions">
              <Button variant="secondary" onClick={prevStep}>
                <BackIcon /> Back
              </Button>
              <Button
                onClick={() => nextStep("goals")}
                disabled={!usage.length}
              >
                Continue
              </Button>
            </div>
          </div>
        );

      case "goals":
        return (
          <GoalsStep
            addGoal={addGoal}
            goals={goals}
            nextStep={nextStep}
            prevStep={prevStep}
            removeGoal={removeGoal}
            updateGoal={updateGoal}
          />
        );

      case "tickets":
        return (
          <TicketsStep
            addTicket={addTicket}
            handleFinishOnboarding={handleFinishOnboarding}
            loading={loading}
            prevStep={prevStep}
            removeTicket={removeTicket}
            tickets={tickets}
            updateTicket={updateTicket}
          />
        );

      case "model":
        return (
          <div className="onboarding-step">
            <div className="onboarding-title">
              <div>
                <h2>Connect an AI model</h2>
                <p>
                  Your workspace is ready. It runs on a model you choose: a private deployment
                  with our partner kvrun, your own endpoint, or a provider API. You can change this later in Settings.
                </p>
              </div>
            </div>
            <WorkspaceRoleProvider>
              <ToastProvider>
                <ModelSettings compact onSaved={() => setModelReady(true)} />
              </ToastProvider>
            </WorkspaceRoleProvider>
            <div className="actions">
              <Button variant="secondary" onClick={() => { window.location.href = "/home"; }}>
                Skip for now
              </Button>
              <Button onClick={() => { window.location.href = "/home"; }} disabled={!modelReady}>
                Go to my workspace
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-progress">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-steps">
          {steps.map((s, idx) => (
            <div key={s.id} className="progress-step">
              <div className={`dot ${idx <= currentIndex ? "active" : ""}`} />
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      {renderStep()}
    </div>
  );
}
