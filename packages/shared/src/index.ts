export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TenantSummary {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  tenantId: string;
  firstName?: string | null;
  lastName?: string | null;
  isEmailVerified: boolean;
}

export interface AuthResponse {
  user: UserSummary;
  tenant?: TenantSummary;
  tokens: AuthTokens;
}
