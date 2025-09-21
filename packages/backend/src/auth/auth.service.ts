import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import type { AuthResponse, GenericMessageResponse, RequestPasswordResetResponse, TokenPayload, User as SharedUser, VerifyTokenResponse } from '@saas-boilerplate/shared';
import * as bcrypt from 'bcryptjs';
import ms from 'ms';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../common/prisma.service';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new BadRequestException('Email is already registered.');
    }

    const tenant = await this.ensureTenant(dto.tenantName);
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        tenantId: tenant.id
      }
    });

    const tokens = await this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      ...tokens
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } }
    });

    const tokens = await this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      ...tokens
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh request.');
    }

    const refreshTokens = await this.prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    let validToken: Prisma.RefreshTokenWhereUniqueInput | null = null;
    for (const token of refreshTokens) {
      if (token.expiresAt < new Date()) {
        await this.prisma.refreshToken.delete({ where: { id: token.id } });
        continue;
      }

      const match = await bcrypt.compare(dto.refreshToken, token.tokenHash);
      if (match) {
        validToken = { id: token.id };
        break;
      }
    }

    if (!validToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    await this.prisma.refreshToken.delete({ where: validToken });

    const tokens = await this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      ...tokens
    };
  }

  async verify(dto: VerifyTokenDto): Promise<VerifyTokenResponse> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(dto.token, {
        secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET', 'access-secret')
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('Invalid token.');
      }

      return {
        valid: true,
        payload,
        user: this.sanitizeUser(user)
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid token.');
    }
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<RequestPasswordResetResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      return {
        message: 'If an account exists, password reset instructions will be sent.'
      };
    }

    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        consumed: false,
        expiresAt: { lt: new Date() }
      },
      data: {
        consumed: true
      }
    });

    const resetToken = randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + ms('1h'));

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashedToken,
        expiresAt
      }
    });

    return {
      message: 'Password reset token generated. Implement email delivery in production.',
      resetToken
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
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    let tokenRecord: { id: string } | null = null;
    for (const token of tokens) {
      const match = await bcrypt.compare(dto.token, token.tokenHash);
      if (match) {
        tokenRecord = { id: token.id };
        break;
      }
    }

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      }),
      this.prisma.passwordResetToken.update({
        where: tokenRecord,
        data: { consumed: true }
      })
    ]);

    return {
      message: 'Password has been reset successfully.'
    };
  }

  private async ensureTenant(name: string) {
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

    return this.prisma.tenant.create({
      data: {
        name,
        slug
      }
    });
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private sanitizeUser(user: User): SharedUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...sanitized } = user;

    return {
      ...sanitized,
      createdAt: sanitized.createdAt.toISOString(),
      updatedAt: sanitized.updatedAt.toISOString()
    };
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload: TokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET', 'access-secret'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRATION', '900s')
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET', 'refresh-secret'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRATION', '7d')
    });

    return { accessToken, refreshToken };
  }

  private getRefreshExpirationMs(): number {
    const configured = this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRATION', '7d');
    const parsed = ms(configured);
    if (typeof parsed === 'number') {
      return parsed;
    }
    return ms('7d');
  }

  private async persistRefreshToken(userId: string, refreshToken: string) {
    const expiresAt = new Date(Date.now() + this.getRefreshExpirationMs());
    const hashedToken = await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashedToken,
        expiresAt
      }
    });
  }
}
