import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Gate for any signed-in area. Sends anonymous visitors to /login, remembering
    where they were headed so login can bounce them back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const location = useLocation();
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Gate for the main app: signed in AND finished onboarding. A signed-in user who
    hasn't onboarded is routed to finish it first. */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const { isAuthed, user } = useAuth();
  const location = useLocation();
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user && !user.onboarded) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
