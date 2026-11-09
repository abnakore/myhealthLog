/**
 * Authentication API calls.
 * Maps to /api/v1/auth/* backend endpoints.
 */
import { api } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  onboarded: boolean;
  auth_method: "password" | "google";
  date_joined: string;
  photoUrl: string | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface RegisterResponse extends AuthTokens {
  user: AuthUser;
}

export interface GoogleLoginResponse extends AuthTokens {
  user: AuthUser;
  is_new: boolean;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/v1/auth/login/", { email, password });
  return res.data;
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>("/v1/auth/register/", { name, email, password });
  return res.data;
}

export async function logout(refresh: string): Promise<void> {
  await api.post("/v1/auth/logout/", { refresh });
}

export async function getMe(): Promise<AuthUser> {
  const res = await api.get<AuthUser>("/v1/auth/me/");
  return res.data;
}

export async function patchMe(name: string): Promise<AuthUser> {
  const res = await api.patch<AuthUser>("/v1/auth/me/", { name });
  return res.data;
}

export async function googleLogin(idToken: string): Promise<GoogleLoginResponse> {
  const res = await api.post<GoogleLoginResponse>("/v1/auth/google/", { id_token: idToken });
  return res.data;
}

export async function completeOnboarding(): Promise<AuthUser> {
  const res = await api.post<AuthUser>("/v1/auth/onboarding/complete/");
  return res.data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.post("/v1/auth/password/change/", {
    current_password: currentPassword,
    new_password: newPassword,
    confirm_password: newPassword,
  });
}

export interface PasswordResetRequestResponse {
  detail: string;
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResponse> {
  const res = await api.post<PasswordResetRequestResponse>("/v1/auth/password/reset/", { email });
  return res.data;
}

export interface PasswordResetConfirmResponse {
  detail: string;
}

export async function confirmPasswordReset(
  uid: string,
  token: string,
  newPassword: string,
  confirmPassword: string,
): Promise<PasswordResetConfirmResponse> {
  const res = await api.post<PasswordResetConfirmResponse>(
    "/v1/auth/password/reset/confirm/",
    {
      uid,
      token,
      new_password: newPassword,
      confirm_password: confirmPassword,
    },
  );
  return res.data;
}
