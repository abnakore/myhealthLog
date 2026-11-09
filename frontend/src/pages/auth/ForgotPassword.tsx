import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { apiErrorMessage } from "@/services/api";
import { requestPasswordReset } from "@/services/auth";
import { AuthShell } from "./AuthShell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const { isAuthed } = useAuth();
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (isAuthed) {
    return <Navigate to="/app" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: { email?: string } = {};
    if (!email.trim()) errs.email = "Enter your email.";
    else if (!EMAIL_RE.test(email.trim())) {
      errs.email = "That doesn't look like an email address.";
    }
    setFieldErrors(errs);
    setFormError("");
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        intro="If an account with that email exists, a password reset link is on its way. The link is valid for three days."
        footer={
          <>
            Remembered it?{" "}
            <Link
              to="/login"
              className="font-semibold text-mhl-accent hover:text-mhl-accent-strong"
            >
              Back to login
            </Link>
          </>
        }
      >
        <p className="text-mhl-body text-mhl-muted">
          Nothing arrived? Check spam, or request another link.
        </p>
        <Button
          variant="secondary"
          size="lg"
          block
          className="mt-4"
          onClick={() => setSent(false)}
        >
          Send another link
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      intro="Enter the email you signed up with and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-mhl-accent hover:text-mhl-accent-strong">
            Back to login
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

        <Button type="submit" size="lg" block loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
