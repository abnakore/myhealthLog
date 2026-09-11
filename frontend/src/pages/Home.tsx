import { Navigate } from "react-router-dom";

/** The bare "/" entry point. Routing and the auth gates decide where a visitor
    actually lands (dashboard, onboarding, or login), so this just forwards in. */
export default function Home() {
  return <Navigate to="/app" replace />;
}
