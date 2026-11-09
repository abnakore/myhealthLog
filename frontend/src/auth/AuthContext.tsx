/**
 * AuthContext — real JWT authentication backed by the Django/DRF backend.
 *
 * Token storage:
 *   - access  → sessionStorage (cleared when tab closes)
 *   - refresh → localStorage   (persists across refreshes)
 *
 * On mount the context:
 *  1. Reads any persisted tokens from storage.
 *  2. If tokens exist, calls GET /auth/me/ to rehydrate the user.
 *  3. Listens for the 'auth:logout' event fired by the axios interceptor
 *     when a refresh attempt fails, so any page that gets a 401 cascade
 *     ends up here and the user is redirected to /login.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  register as apiRegister,
  googleLogin as apiGoogleLogin,
  completeOnboarding as apiCompleteOnboarding,
  logout as apiLogout,
  getMe,
  type AuthUser,
} from "@/services/auth";
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
} from "@/services/api";

export type { AuthUser };

export type AuthMethod = "password" | "google";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<{ isNew: boolean }>;
  completeOnboarding: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Bootstrap: rehydrate session from stored tokens
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function bootstrap() {
      if (getAccessToken() || getRefreshToken()) {
        try {
          const me = await getMe();
          setUser(me);
        } catch {
          // Tokens are invalid / expired — clear them silently.
          clearTokens();
        }
      }
      setIsLoading(false);
    }
    void bootstrap();
  }, []);

  // ---------------------------------------------------------------------------
  // Listen for the global logout event fired by the axios refresh interceptor.
  // This handles the case where the backend session expires mid-session.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleForcedLogout() {
      setUser(null);
    }
    window.addEventListener("auth:logout", handleForcedLogout);
    return () => window.removeEventListener("auth:logout", handleForcedLogout);
  }, []);

  // ---------------------------------------------------------------------------
  // Auth actions
  // ---------------------------------------------------------------------------

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    saveTokens(data.access, data.refresh);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await apiRegister(name, email, password);
      saveTokens(data.access, data.refresh);
      setUser(data.user);
    },
    [],
  );

  /**
   * Google OAuth login.
   *
   * Call this with a Google ID token (from useGoogleLogin or GoogleLogin component)
   * to exchange it for myHealthLog JWT tokens.
   */
  const loginWithGoogle = useCallback(
    async (idToken: string): Promise<{ isNew: boolean }> => {
      const data = await apiGoogleLogin(idToken);
      saveTokens(data.access, data.refresh);
      setUser(data.user);
      return { isNew: data.is_new };
    },
    [],
  );

  const completeOnboarding = useCallback(async () => {
    const updated = await apiCompleteOnboarding();
    setUser(updated);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await apiLogout(refresh);
      } catch {
        // Even if the server request fails, we still clear local state.
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthed: user !== null,
      isLoading,
      login,
      register,
      loginWithGoogle,
      completeOnboarding,
      updateUser,
      logout,
    }),
    [user, isLoading, login, register, loginWithGoogle, completeOnboarding, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
