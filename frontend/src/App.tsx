import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireOnboarded } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import GoogleCallback from "@/pages/auth/GoogleCallback";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import AddRecord from "@/pages/AddRecord";
import RecordViewPage from "@/components/records/RecordViewPage";
import Profile from "@/pages/Profile";
import Allergies from "@/pages/Allergies";
import Medications from "@/pages/Medications";
import Conditions from "@/pages/Conditions";
import Appointments from "@/pages/Appointments";
import Documents from "@/pages/Documents";
import Measurements from "@/pages/Measurements";
import Timeline from "@/pages/Timeline";
import HealthContexts from "@/pages/HealthContexts";
import HealthContextProfile from "@/pages/HealthContextProfile";
import CareProviders from "@/pages/CareProviders";
import CareProxy from "@/pages/CareProxy";
import EmergencyAccess from "@/pages/EmergencyAccess";
import EmergencyView from "@/pages/EmergencyView";
import Connections from "@/pages/Connections";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/google/callback" element={<GoogleCallback />} />
      {/* The emergency view a responder reaches by scanning the card's code: no
          account, no shell, and nothing reachable beyond this one page. It sits above
          the catch-all so an unknown code lands in it (and shows its own state)
          rather than bouncing into the signed-in app. */}
      <Route path="/emergency/:code" element={<EmergencyView />} />

      {/* Signed in, onboarding not yet complete */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />

      {/* The app proper — signed in and onboarded */}
      <Route
        path="/app"
        element={
          <RequireOnboarded>
            <AppShell />
          </RequireOnboarded>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="add" element={<AddRecord />} />
        <Route path="profile" element={<Profile />} />
        <Route path="allergies" element={<Allergies />} />
        <Route path="medications" element={<Medications />} />
        <Route path="conditions" element={<Conditions />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="documents" element={<Documents />} />
        <Route path="measurements" element={<Measurements />} />
        {/* Lab results and imaging live inside Documents now. The old pages are
            gone, but their URLs still land on the matching filter. */}
        <Route
          path="lab-results"
          element={<Navigate to="/app/documents?type=LAB_RESULT" replace />}
        />
        <Route path="imaging" element={<Navigate to="/app/documents?type=SCAN" replace />} />
        <Route path="timeline" element={<Timeline />} />
        {/* Condition-aware profiles: the list of lenses, and one lens itself. Both live
            under /app so a proxy reads their relative's profiles through the same gates. */}
        <Route path="contexts" element={<HealthContexts />} />
        <Route path="contexts/:id" element={<HealthContextProfile />} />
        {/* Sharing & safety — reached from the Profile hub, not the tab bar. */}
        <Route path="providers" element={<CareProviders />} />
        <Route path="proxy" element={<CareProxy />} />
        {/* The page's old name, kept so a bookmarked link still lands somewhere real. */}
        <Route path="circle" element={<Navigate to="/app/proxy" replace />} />
        <Route path="emergency" element={<EmergencyAccess />} />
        <Route path="connections" element={<Connections />} />
        {/* Dynamic record detail page — one page renders any record type's view. */}
        <Route path="records/:type/:id" element={<RecordViewPage />} />
      </Route>

      {/* Everything else lands in the app; the gates route anonymous users to login. */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
