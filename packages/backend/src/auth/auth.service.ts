import { randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthResponse,
  GenericMessageResponse,
  Permission,
  RequestPasswordResetResponse,
  RoleName,
  TokenPayload,
  User as SharedUser,
  VerifyTokenResponse,
} from '@saas-boilerplate/shared';
import bcryptModuleRaw from 'bcryptjs';
import ms from 'ms';

import { PrismaService } from '../common/prisma.service.js';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto.js';
import { VerifyTokenDto } from './dto/verify-token.dto.js';

const DEFAULT_REFRESH_TOKEN_EXPIRATION: ms.StringValue = '7d';

const DURATION_PATTERN =
  /^-?\d+(?:\.\d+)?(?:\s*(?:ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?))?$/i;

const isDurationString = (value: string): value is ms.StringValue => DURATION_PATTERN.test(value);

type BcryptModule = typeof import('bcryptjs');

const bcryptModule: BcryptModule =
  (bcryptModuleRaw as BcryptModule & { default?: BcryptModule }).default ??
  (bcryptModuleRaw as BcryptModule);

const bcrypt = {
  async hash(value: string, saltOrRounds: string | number): Promise<string> {
    if (typeof bcryptModule.hash === 'function') {
      return bcryptModule.hash(value, saltOrRounds);
    }

    if (typeof bcryptModule.hashSync === 'function') {
      return bcryptModule.hashSync(value, saltOrRounds);
    }

    throw new Error('bcrypt.hash is not available');
  },
  async compare(value: string, hash: string): Promise<boolean> {
    if (typeof bcryptModule.compare === 'function') {
      return bcryptModule.compare(value, hash);
    }

    if (typeof bcryptModule.compareSync === 'function') {
      return bcryptModule.compareSync(value, hash);
    }

    throw new Error('bcrypt.compare is not available');
  },
};

const parseDurationMs = (value: string | undefined): number | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!isDurationString(normalized)) {
    return null;
  }

  const parsed = ms(normalized);

  return typeof parsed === 'number' ? parsed : null;
};

const DEFAULT_REFRESH_TOKEN_EXPIRATION_MS = (() => {
  const parsed = parseDurationMs(DEFAULT_REFRESH_TOKEN_EXPIRATION);

  if (parsed === null) {
    throw new Error('Invalid default refresh token expiration');
  }

  return parsed;
})();

const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  OWNER: ['MANAGE_USERS', 'MANAGE_BILLING', 'VIEW_BILLING', 'MANAGE_SUBSCRIPTION'],
  ADMIN: ['MANAGE_USERS', 'MANAGE_BILLING', 'VIEW_BILLING', 'MANAGE_SUBSCRIPTION'],
  MEMBER: ['VIEW_BILLING'],
};

const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  OWNER: 'Tenant owner with unrestricted access.',
  ADMIN: 'Administrator with management capabilities.',
  MEMBER: 'Standard member with read-only access.',
};

type MembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  roleId: string;
  createdAt: Date;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
  } | null;
  role?: {
    id: string;
    name: RoleName;
    permissions: unknown;
  } | null;
};

type HydratedMembership = Omit<MembershipRecord, 'tenant' | 'role'> & {
  tenant: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
  };
  role: {
    id: string;
    name: RoleName;
    permissions: Permission[];
  };
};

type DbUser = {
  id: string;
  email: string;
  name: string | null;
  password: string;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberships: MembershipRecord[];
};

type HydratedDbUser = Omit<DbUser, 'memberships'> & {
  memberships: HydratedMembership[];
};

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly membershipInclude = {
    tenant: {
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
      },
    },
    role: {
      select: {
        id: true,
        name: true,
        permissions: true,
      },
    },
  } as const;

  private readonly userWithMembershipInclude = {
    memberships: {
      include: this.membershipInclude,
      orderBy: {
        createdAt: 'asc',
      },
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new BadRequestException('Email is already registered.');
    }

    const tenant = await this.ensureTenant(dto.tenantName, dto.email);
    const ownerRole = await this.ensureRole('OWNER');
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const createdUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        memberships: {
          create: {
            tenant: { connect: { id: tenant.id } },
            role: { connect: { id: ownerRole.id } },
          },
        },
      },
      include: this.userWithMembershipInclude,
    });

    const user = await this.ensureMembershipsLoaded(this.toDbUser(createdUser));

    const tokens = await this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const userRecord = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: this.userWithMembershipInclude,
    });

    if (!userRecord) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const user = await this.ensureMembershipsLoaded(this.toDbUser(userRecord));

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, expiresAt: { lt: new Date() }, revoked: false },
      data: { revoked: true },
    });

    const tokens = await this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const userRecord = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: this.userWithMembershipInclude,
    });
    if (!userRecord) {
      throw new UnauthorizedException('Invalid refresh request.');
    }

    const user = await this.ensureMembershipsLoaded(this.toDbUser(userRecord));

    const refreshTokens = await this.prisma.refreshToken.findMany({
      where: { userId: user.id, revoked: false },
      orderBy: { createdAt: 'desc' },
    });

    let validTokenId: string | null = null;
    for (const token of refreshTokens) {
      if (token.expiresAt < new Date()) {
        await this.prisma.refreshToken.update({
          where: { id: token.id },
          data: { revoked: true },
        });
        continue;
      }

      const match = await bcrypt.compare(dto.refreshToken, token.tokenHash);
      if (match) {
        validTokenId = token.id;
        break;
      }
    }

    if (!validTokenId) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    await this.prisma.refreshToken.update({
      where: { id: validTokenId },
      data: { revoked: true },
    });

    const tokens = await this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async verify(dto: VerifyTokenDto): Promise<VerifyTokenResponse> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(dto.token, {
        secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET', 'access-secret'),
      });
      const userRecord = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: this.userWithMembershipInclude,
      });
      if (!userRecord) {
        throw new UnauthorizedException('Invalid token.');
      }

      const user = await this.ensureMembershipsLoaded(this.toDbUser(userRecord));

      return {
        valid: true,
        payload,
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid token.');
    }
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<RequestPasswordResetResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      return {
        message: 'If an account exists, password reset instructions will be sent.',
      };
    }

    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        consumed: false,
        expiresAt: { lt: new Date() },
      },
      data: {
        consumed: true,
      },
    });

    const resetToken = randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + ms('1h'));

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashedToken,
        expiresAt,
      },
    });

    return {
      message: 'Password reset token generated. Implement email delivery in production.',
      resetToken,
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto): Promise<GenericMessageResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new BadRequestException('Invalid password reset request.');
    }

    const tokens = await this.prisma.passwordResetToken.findMany({
      where: {
        userId: user.id,
        consumed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    let tokenId: string | null = null;
    for (const token of tokens) {
      const match = await bcrypt.compare(dto.token, token.tokenHash);
      if (match) {
        tokenId = token.id;
        break;
      }
    }

    if (!tokenId) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: tokenId },
        data: { consumed: true },
      }),
    ]);

    return {
      message: 'Password has been reset successfully.',
    };
  }

  private async ensureTenant(name: string, requesterEmail: string) {
    const baseSlug = this.slugify(name) || `tenant-${randomBytes(3).toString('hex')}`;
    let slug = baseSlug;
    let counter = 1;

    // Ensure the generated slug is unique per tenant
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.tenant.findUnique({ where: { slug } });
      if (!existing) {
        break;
      }
      slug = `${baseSlug}-${counter++}`;
    }

    const requestedDomain = this.extractDomain(requesterEmail);
    const domain = requestedDomain
      ? (await this.prisma.tenant.findUnique({ where: { domain: requestedDomain } }))
        ? null
        : requestedDomain
      : null;

    return this.prisma.tenant.create({
      data: {
        name,
        slug,
        domain,
      },
    });
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private extractDomain(email: string) {
    const [, domain] = email.split('@');
    return domain ? domain.toLowerCase() : null;
  }

  private getActiveMembership(user: HydratedDbUser): HydratedMembership | null {
    if (user.memberships.length === 0) {
      return null;
    }

    return [...user.memberships].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  }

  private async ensureRole(name: RoleName) {
    const permissions = DEFAULT_ROLE_PERMISSIONS[name] ?? [];
    const description = ROLE_DESCRIPTIONS[name] ?? `${name} role`;

    return this.prisma.role.upsert({
      where: { name },
      update: {
        description,
        permissions,
      },
      create: {
        id: `role-${name.toLowerCase()}`,
        name,
        description,
        permissions,
      },
    });
  }

  private toDbUser(user: unknown): DbUser {
    const record = user as DbUser & { memberships?: MembershipRecord[] | null };

    return {
      ...record,
      memberships: Array.isArray(record.memberships) ? record.memberships : [],
    };
  }

  private normalizeMembership(membership: MembershipRecord): HydratedMembership {
    const tenant = membership.tenant;
    if (!tenant) {
      throw new Error('Membership is missing tenant relation data');
    }

    const role = membership.role;
    if (!role) {
      throw new Error('Membership is missing role relation data');
    }

    const permissions = Array.isArray(role.permissions) ? (role.permissions as Permission[]) : [];

    return {
      id: membership.id,
      userId: membership.userId,
      tenantId: membership.tenantId,
      roleId: membership.roleId,
      createdAt: membership.createdAt,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
      },
      role: {
        id: role.id,
        name: role.name,
        permissions,
      },
    };
  }

  private async loadMemberships(userId: string): Promise<HydratedMembership[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: this.membershipInclude,
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => this.normalizeMembership(membership));
  }

  private hasHydratedMemberships(user: DbUser): user is HydratedDbUser {
    return (
      Array.isArray(user.memberships) &&
      user.memberships.length > 0 &&
      user.memberships.every((membership) => membership.tenant && membership.role)
    );
  }

  private async ensureMembershipsLoaded(user: DbUser): Promise<HydratedDbUser> {
    if (this.hasHydratedMemberships(user)) {
      return {
        ...user,
        memberships: user.memberships.map((membership) => this.normalizeMembership(membership)),
      };
    }

    const memberships = await this.loadMemberships(user.id);

    if (memberships.length === 0) {
      this.logger.warn(
        `User ${user.email} (${user.id}) has no tenant memberships. ` +
          'If this account should have seeded data, ensure the seed ran against the same database the API is using.',
      );
    }

    return {
      ...user,
      memberships,
    };
  }

  private sanitizeUser(user: HydratedDbUser): SharedUser {
    const sortedMemberships = [...user.memberships].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const membershipSummaries = sortedMemberships.map((membership) => ({
      id: membership.id,
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      tenantSlug: membership.tenant.slug,
      tenantDomain: membership.tenant.domain,
      roleId: membership.roleId,
      roleName: membership.role.name,
      permissions: membership.role.permissions,
      createdAt: membership.createdAt.toISOString(),
    }));

    const [activeMembershipSummary] = membershipSummaries;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      memberships: membershipSummaries,
      ...(activeMembershipSummary ? { activeMembership: activeMembershipSummary } : {}),
      activeMembershipId: activeMembershipSummary?.id,
    };
  }

  private async generateTokens(user: HydratedDbUser): Promise<AuthTokens> {
    const activeMembership = this.getActiveMembership(user);
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
    };

    if (activeMembership) {
      payload.membershipId = activeMembership.id;
      payload.tenantId = activeMembership.tenantId;
      payload.role = activeMembership.role.name;
    }

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET', 'access-secret'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRATION', '900s'),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET', 'refresh-secret'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRATION', '7d'),
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private getRefreshExpirationMs(): number {
    const configured = this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRATION');

    return parseDurationMs(configured) ?? DEFAULT_REFRESH_TOKEN_EXPIRATION_MS;
  }

  private async persistRefreshToken(userId: string, refreshToken: string) {
    const expiresAt = new Date(Date.now() + this.getRefreshExpirationMs());
    const hashedToken = await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashedToken,
        expiresAt,
        revoked: false,
      },
    });
  }
}
