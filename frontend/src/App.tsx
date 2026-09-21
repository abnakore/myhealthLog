import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireOnboarded } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import GoogleCallback from "@/pages/auth/GoogleCallback";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import AddRecord from "@/pages/AddRecord";
import Profile from "@/pages/Profile";
import Allergies from "@/pages/Allergies";
import Medications from "@/pages/Medications";
import Conditions from "@/pages/Conditions";
import Appointments from "@/pages/Appointments";
import Documents from "@/pages/Documents";
import Measurements from "@/pages/Measurements";
import Timeline from "@/pages/Timeline";
import CareProviders from "@/pages/CareProviders";
import CircleOfTrust from "@/pages/CircleOfTrust";
import EmergencyAccess from "@/pages/EmergencyAccess";
import Connections from "@/pages/Connections";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/google/callback" element={<GoogleCallback />} />

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
        <Route path="timeline" element={<Timeline />} />
        {/* Sharing & safety — reached from the Profile hub, not the tab bar. */}
        <Route path="providers" element={<CareProviders />} />
        <Route path="circle" element={<CircleOfTrust />} />
        <Route path="emergency" element={<EmergencyAccess />} />
        <Route path="connections" element={<Connections />} />
      </Route>

      {/* Everything else lands in the app; the gates route anonymous users to login. */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
