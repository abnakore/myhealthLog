import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { apiErrorMessage, apiFieldErrors } from "@/services/api";
import { confirmPasswordReset } from "@/services/auth";
import { AuthShell } from "./AuthShell";

/**
 * The page the emailed reset link lands on. The uid + token travel in the query
 * string; they are single-use in effect because the token is derived from the
 * password hash and last login, so it stops validating once the password changes.
 */
export default function ResetPassword() {
  const { isAuthed } = useAuth();
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (isAuthed) {
    return <Navigate to="/app" replace />;
  }

  if (!uid || !token) {
    return (
      <AuthShell
        title="This link isn't valid"
        intro="The reset link is missing its token, or it was already used. Request a fresh one to continue."
        footer={
          <Link to="/login" className="font-semibold text-mhl-accent hover:text-mhl-accent-strong">
            Back to login
          </Link>
        }
      >
        <Link
          to="/forgot-password"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[0.7rem] bg-mhl-accent px-6 text-mhl-lead font-semibold text-white hover:bg-mhl-accent-strong"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        intro="Your new password is set. Sign in with it to get back to your record."
      >
        <Link
          to="/login"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[0.7rem] bg-mhl-accent px-6 text-mhl-lead font-semibold text-white hover:bg-mhl-accent-strong"
        >
          Sign in
        </Link>
      </AuthShell>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: { password?: string; confirm?: string } = {};
    if (!password) errs.password = "Choose a new password.";
    else if (password.length < 8) errs.password = "Use at least 8 characters.";
    if (confirm !== password) errs.confirm = "The passwords don't match.";
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await confirmPasswordReset(uid, token, password, confirm);
      setDone(true);
    } catch (err) {
      // The backend enforces its own password rules, and reports a dead token
      // separately — surface whichever it said.
      const fields = apiFieldErrors(err);
      setErrors({ password: fields.new_password, confirm: fields.confirm_password });
      setFormError(fields.token ?? apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro="Pick something you haven't used before. You'll sign in with it from now on."
      footer={
        <Link to="/login" className="font-semibold text-mhl-accent hover:text-mhl-accent-strong">
          Back to login
        </Link>
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
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint={errors.password ? undefined : "At least 8 characters."}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <Button type="submit" size="lg" block loading={busy}>
          Set new password
        </Button>
      </form>
    </AuthShell>
  );
}
