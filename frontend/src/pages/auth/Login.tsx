import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/fields";
import { apiErrorMessage } from "@/services/api";
import { AuthShell, OrDivider } from "./AuthShell";
import { GoogleSignInButton } from "./GoogleSignInButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { isAuthed, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. a refresh restored the session) — don't show the form.
  if (isAuthed) {
    return <Navigate to={user?.onboarded ? (from ?? "/app") : "/onboarding"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = "Enter your email.";
    else if (!EMAIL_RE.test(email.trim())) errs.email = "That doesn't look like an email address.";
    if (!password) errs.password = "Enter your password.";
    setFieldErrors(errs);
    setFormError("");
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await login(email, password);
      navigate(from ?? "/app", { replace: true });
    } catch (err) {
      setFormError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      intro="Sign in to reach your records and emergency card."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-semibold text-mhl-accent hover:text-mhl-accent-strong">
            Create an account
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
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          error={fieldErrors.email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <div>
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            error={fieldErrors.password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
          <div className="mt-1.5 text-right">
            <Link
              to="/forgot-password"
              className="text-mhl-fine font-medium text-mhl-accent hover:text-mhl-accent-strong"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" block loading={busy}>
          Log in
        </Button>
      </form>

      <OrDivider />

      <GoogleSignInButton onError={setFormError} />
    </AuthShell>
  );
}
