import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/fields";
import { apiErrorMessage, apiFieldErrors } from "@/services/api";
import { AuthShell, OrDivider } from "./AuthShell";
import { GoogleSignInButton } from "./GoogleSignInButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export default function Register() {
  const { isAuthed, user, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  // A care-proxy invite email links here with ?email= so the invite matches.
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAuthed) {
    return <Navigate to={user?.onboarded ? "/app" : "/onboarding"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!name.trim()) errs.name = "Enter your name.";
    if (!email.trim()) errs.email = "Enter your email.";
    else if (!EMAIL_RE.test(email.trim())) errs.email = "That doesn't look like an email address.";
    if (!password) errs.password = "Choose a password.";
    else if (password.length < 8) errs.password = "Use at least 8 characters.";
    if (confirm !== password) errs.confirm = "The passwords don't match.";
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await register(name, email, password);
      // A fresh account has no health data yet, so head into onboarding, not the app.
      navigate("/onboarding", { replace: true });
    } catch (err) {
      // The backend enforces password rules the client only partially checks
      // (e.g. "This password is too common."), so show what it said.
      const fieldErrors = apiFieldErrors(err);
      const known: Errors = {};
      if (fieldErrors.name) known.name = fieldErrors.name;
      if (fieldErrors.email) known.email = fieldErrors.email;
      if (fieldErrors.password) known.password = fieldErrors.password;
      setErrors(known);
      if (Object.keys(known).length === 0) {
        setFormError(apiErrorMessage(err));
      }
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      intro="A few details now, then we'll set up your health record together."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-mhl-accent hover:text-mhl-accent-strong">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger"
          >
            {formError}
          </p>
        )}

        <TextField
          label="Full name"
          autoComplete="name"
          value={name}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Amina Yusuf"
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint={errors.password ? undefined : "At least 8 characters."}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <Button type="submit" size="lg" block loading={busy}>
          Create account
        </Button>
      </form>

      <OrDivider />

      <GoogleSignInButton onError={setFormError} />
    </AuthShell>
  );
}
