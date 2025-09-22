export type Permission = 'MANAGE_USERS' | 'MANAGE_BILLING' | 'VIEW_BILLING' | 'MANAGE_SUBSCRIPTION';
export type RoleName = 'OWNER' | 'ADMIN' | 'MEMBER';
export type SubscriptionStatus =
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'PAUSED';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantDomain?: string | null;
  roleId: string;
  roleName: RoleName;
  permissions: Permission[];
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  memberships: MembershipSummary[];
  activeMembershipId?: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  membershipId?: string;
  tenantId?: string;
  role?: RoleName;
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
