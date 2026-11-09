import { GoogleOAuthProvider } from "@react-oauth/google";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { GOOGLE_CLIENT_ID } from "@/config/config";
import { AppModeProvider } from "@/store/AppModeContext";
import { CareProxyProvider } from "@/store/CareProxyContext";
import { ContextsProvider } from "@/store/ContextsContext";
import { RecordsProvider } from "@/store/RecordsContext";
import { SharingProvider } from "@/store/SharingContext";
import { NotificationsProvider } from "@/store/NotificationsContext";
import "./index.css";

// The app reads the Google Client ID from VITE_GOOGLE_CLIENT_ID (frontend/.env,
// gitignored). When it is set, <GoogleOAuthProvider> boots Google Identity
// Services and the real Google OAuth flow resolves a genuine id_token. Without
// it the provider is not mounted at all, and the sign-in screens explain that
// Google sign-in is unavailable rather than failing inside the provider.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {GOOGLE_CLIENT_ID ? (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <AuthProvider>
            <CareProxyProvider>
              <AppModeProvider>
                <RecordsProvider>
                  <ContextsProvider>
                    <SharingProvider>
                      <NotificationsProvider>
                        <App />
                      </NotificationsProvider>
                    </SharingProvider>
                  </ContextsProvider>
                </RecordsProvider>
              </AppModeProvider>
            </CareProxyProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
      ) : (
        <AuthProvider>
          <CareProxyProvider>
            <AppModeProvider>
              <RecordsProvider>
                <ContextsProvider>
                  <SharingProvider>
                    <NotificationsProvider>
                      <App />
                    </NotificationsProvider>
                  </SharingProvider>
                </ContextsProvider>
              </RecordsProvider>
            </AppModeProvider>
          </CareProxyProvider>
        </AuthProvider>
      )}
    </BrowserRouter>
  </StrictMode>
);
