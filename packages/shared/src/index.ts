export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  payload: TokenPayload;
  user: User;
}

export interface RequestPasswordResetResponse {
  message: string;
  resetToken?: string;
}

export interface GenericMessageResponse {
  message: string;
}
