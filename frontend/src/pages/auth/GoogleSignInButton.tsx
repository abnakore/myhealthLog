/**
 * Sign in with Google.
 *
 * Google Identity Services renders the button itself (a home-made Google button
 * is against its branding rules), so this measures the slot it is given and asks
 * GIS to render at that width. The credential it returns is a signed Google ID
 * token, which is posted to the backend; the backend verifies the signature,
 * issuer, expiry and audience before minting our own JWT pair.
 *
 * Both the login and register screens use this, so "new account via Google"
 * and "returning account via Google" take the same path — only the landing
 * route differs.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { GoogleIcon } from "@/components/icons";
import { apiErrorMessage } from "@/services/api";
import { GOOGLE_CLIENT_ID } from "@/config/config";

export function GoogleSignInButton({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const slotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  // GIS renders at a fixed pixel width; keep it inside the 200–400 range it
  // accepts and re-render the button when the column resizes.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const measure = () => {
      const next = Math.round(slot.getBoundingClientRect().width);
      setWidth(Math.min(400, Math.max(200, next || 320)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  async function handleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      onError("Google sign-in failed. Please try again.");
      return;
    }
    try {
      const { isNew } = await loginWithGoogle(response.credential);
      navigate(isNew ? "/onboarding" : "/app", { replace: true });
    } catch (err) {
      onError(apiErrorMessage(err));
    }
  }

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="space-y-1.5">
        <Button variant="secondary" size="lg" block disabled icon={<GoogleIcon size={18} />}>
          Continue with Google
        </Button>
        <p className="text-mhl-fine text-mhl-muted">
          Google sign-in isn't configured for this build. Set{" "}
          <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> in{" "}
          <code className="font-mono">frontend/.env</code> to enable it.
        </p>
      </div>
    );
  }

  return (
    <div ref={slotRef} className="flex justify-center">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => onError("Google sign-in failed. Please try again.")}
        text="continue_with"
        theme="outline"
        shape="rectangular"
        size="large"
        width={width}
      />
    </div>
  );
}
