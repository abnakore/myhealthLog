import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { RecordsProvider } from "@/store/RecordsContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RecordsProvider>
          <App />
        </RecordsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
