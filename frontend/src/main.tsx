import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { AppModeProvider } from "@/store/AppModeContext";
import { RecordsProvider } from "@/store/RecordsContext";
import { SharingProvider } from "@/store/SharingContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppModeProvider>
          <RecordsProvider>
            <SharingProvider>
              <App />
            </SharingProvider>
          </RecordsProvider>
        </AppModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
