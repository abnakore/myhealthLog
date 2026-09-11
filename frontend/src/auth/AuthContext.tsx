/**
 * Auth state for the app. There is no backend yet, so this simulates the flows
 * the brief describes (email/password sign-in, manual registration, Google) with
 * localStorage persistence and a short delay to stand in for the network. The
 * shapes match what a DRF backend would return, so swapping in real requests
 * later is a matter of changing the three async functions below.
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
import { genId } from "@/lib/id";

export type AuthMethod = "password" | "google";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  authMethod: AuthMethod;
  /** Whether the first-run onboarding has been completed. Drives routing. */
  onboarded: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<{ isNew: boolean }>;
  completeOnboarding: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
}

const STORAGE_KEY = "mhl.auth.user";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persist(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota — non-fatal, session just won't persist */
  }
}

/** Stand-in for a network round-trip. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStored());

  useEffect(() => {
    persist(user);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    void password;
    await wait(650);
    // Demo hook: an address starting "wrong" simulates a rejected credential, so
    // the inline-error path is reachable without a backend. Anything else signs in
    // as the seeded record owner (already onboarded → straight to the dashboard).
    if (email.trim().toLowerCase().startsWith("wrong")) {
      throw new Error("Incorrect email or password.");
    }
    setUser({
      id: "p_amina",
      name: "Amina Yusuf",
      email: email.trim(),
      authMethod: "password",
      onboarded: true,
    });
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    void password;
    await wait(750);
    setUser({
      id: genId("user"),
      name: name.trim(),
      email: email.trim(),
      authMethod: "password",
      onboarded: false,
    });
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await wait(900);
    // Demo: Google returns a fresh identity, so the new-user branch a reviewer sees
    // is registration → onboarding with the name/email already known.
    setUser({
      id: genId("user"),
      name: "Amina Yusuf",
      email: "amina.yusuf@gmail.com",
      authMethod: "google",
      onboarded: false,
    });
    return { isNew: true };
  }, []);

  const completeOnboarding = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, onboarded: true } : prev));
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const logout = useCallback(() => setUser(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthed: user !== null,
      login,
      register,
      loginWithGoogle,
      completeOnboarding,
      updateUser,
      logout,
    }),
    [user, login, register, loginWithGoogle, completeOnboarding, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
