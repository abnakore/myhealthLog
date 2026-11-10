import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/Spinner";
import { GoogleIcon } from "@/components/icons";

/**
 * /auth/google/callback exists so this URL resolves instead of falling through
 * to the catch-all. Sign in with Google is a popup on the login page (it hands
 * back an ID token, not a redirect with a code), so a visitor who lands here is
 * sent to the sign-in screen where the button lives.
 */
export default function GoogleCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/login", { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-mhl-bg px-4 text-center">
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-mhl-surface ring-1 ring-mhl-rule">
        <GoogleIcon size={26} />
      </span>
      <p className="flex items-center gap-2 text-mhl-lead font-semibold text-mhl-ink">
        <Spinner size={18} /> Redirecting to sign in...
      </p>
      <p className="mt-1 text-mhl-body text-mhl-muted">This only takes a moment.</p>
    </div>
  );
}
