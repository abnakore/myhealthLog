import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Spinner } from "@/components/ui/Spinner";
import { GoogleIcon } from "@/components/icons";

/**
 * The Google OAuth hand-off (1.1a). In a real build the browser returns here from
 * Google's consent screen with a code to exchange; here we simulate the round-trip,
 * then route by whether the account is new: first-timers go straight to onboarding
 * (name and email already known), returning users to the dashboard.
 */
export default function GoogleCallback() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return; // guard React 18 StrictMode's double-mount
    started.current = true;
    loginWithGoogle()
      .then(({ isNew }) => navigate(isNew ? "/onboarding" : "/app", { replace: true }))
      .catch(() => setFailed(true));
  }, [loginWithGoogle, navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-mhl-bg px-4 text-center">
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-mhl-surface ring-1 ring-mhl-rule">
        <GoogleIcon size={26} />
      </span>
      {failed ? (
        <>
          <p className="text-mhl-lead font-semibold text-mhl-ink">Couldn't finish with Google</p>
          <p className="mt-1 text-mhl-body text-mhl-muted">Please head back and try again.</p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="mt-5 font-semibold text-mhl-accent hover:text-mhl-accent-strong"
          >
            Back to log in
          </button>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-mhl-lead font-semibold text-mhl-ink">
            <Spinner size={18} /> Signing you in with Google…
          </p>
          <p className="mt-1 text-mhl-body text-mhl-muted">This only takes a moment.</p>
        </>
      )}
    </div>
  );
}
