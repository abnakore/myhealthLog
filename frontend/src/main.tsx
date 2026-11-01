import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { AppModeProvider } from "@/store/AppModeContext";
import { CareProxyProvider } from "@/store/CareProxyContext";
import { ContextsProvider } from "@/store/ContextsContext";
import { RecordsProvider } from "@/store/RecordsContext";
import { SharingProvider } from "@/store/SharingContext";
import "./index.css";

// Order matters in one place: the care-proxy layer decides whose record the app is
// showing, so it has to mount above the record store that reads that decision. The
// context store sits inside the record store because a profile is a *reading* of the
// record — it borrows the record's own contexts and never keeps its own copy.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppModeProvider>
          <CareProxyProvider>
            <RecordsProvider>
              <ContextsProvider>
                <SharingProvider>
                  <App />
                </SharingProvider>
              </ContextsProvider>
            </RecordsProvider>
          </CareProxyProvider>
        </AppModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
