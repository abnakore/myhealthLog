import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Spinner } from "@/components/ui/Spinner";

/** Full-page loading state shown while tokens are being rehydrated. */
function AuthLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-mhl-bg">
      <Spinner size={28} />
    </div>
  );
}

/** Gate for any signed-in area. Sends anonymous visitors to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthLoading />;
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Gate for the main app: signed in AND finished onboarding. */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const { isAuthed, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthLoading />;
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user && !user.onboarded) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
