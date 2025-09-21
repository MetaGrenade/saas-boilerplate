import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET || 'change-me-too';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { user, tenant } = await this.usersService.createWithTenant({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      tenantName: dto.tenantName
    });

    const verificationToken = randomUUID();
    await this.usersService.createEmailVerificationToken(
      user.id,
      verificationToken,
      this.calculateExpiry('2d')
    );

    const tokens = await this.issueTokens(user.id, user.email, user.tenantId);

    return {
      user: this.stripSensitiveUserFields(user),
      tenant,
      tokens,
      verificationToken
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.revokeUserRefreshTokens(user.id);

    const tokens = await this.issueTokens(user.id, user.email, user.tenantId);

    return {
      user: this.stripSensitiveUserFields(user),
      tokens
    };
  }

  async refreshTokens(dto: RefreshTokenDto) {
    let payload: { sub: string; email: string; tenantId: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: REFRESH_TOKEN_SECRET
      }) as { sub: string; email: string; tenantId: string };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const activeTokens = await this.usersService.listActiveRefreshTokens(user.id);
    const matchingToken = await this.findMatchingRefreshToken(activeTokens, dto.refreshToken);

    if (!matchingToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    await this.usersService.revokeRefreshToken(matchingToken.id);

    const tokens = await this.issueTokens(user.id, user.email, user.tenantId);

    return {
      user: this.stripSensitiveUserFields(user),
      tokens
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenRecord = await this.usersService.findValidEmailVerificationToken(
      dto.userId,
      dto.token
    );

    if (!tokenRecord) {
      throw new BadRequestException('Verification token is invalid or has expired');
    }

    await this.usersService.markEmailVerificationTokenUsed(tokenRecord.id);
    const user = await this.usersService.markEmailVerified(dto.userId);

    return this.stripSensitiveUserFields(user);
  }

  async requestPasswordReset(dto: RequestResetDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return { ok: true };
    }

    const token = randomUUID();
    await this.usersService.createPasswordResetToken(
      user.id,
      token,
      this.calculateExpiry('1h')
    );

    return {
      ok: true,
      resetToken: token
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenRecord = await this.usersService.findValidPasswordResetToken(dto.token);
    if (!tokenRecord) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.usersService.updatePassword(tokenRecord.userId, passwordHash);
    await this.usersService.markPasswordResetTokenUsed(tokenRecord.id);
    await this.usersService.revokeUserRefreshTokens(tokenRecord.userId);

    const user = await this.usersService.findById(tokenRecord.userId);
    if (!user) {
      throw new BadRequestException('User no longer exists');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.tenantId);

    return {
      user: this.stripSensitiveUserFields(user),
      tokens
    };
  }

  private async issueTokens(userId: string, email: string, tenantId: string): Promise<AuthTokens> {
    const payload = { sub: userId, email, tenantId };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: REFRESH_TOKEN_SECRET,
      expiresIn: REFRESH_TOKEN_EXPIRES_IN
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.createRefreshToken(userId, refreshTokenHash, this.calculateExpiry(REFRESH_TOKEN_EXPIRES_IN));

    return {
      accessToken,
      refreshToken
    };
  }

  private async findMatchingRefreshToken(tokens: Array<{ id: string; token: string }>, token: string) {
    for (const candidate of tokens) {
      const matches = await bcrypt.compare(token, candidate.token);
      if (matches) {
        return candidate;
      }
    }
    return null;
  }

  private calculateExpiry(expiresIn: string | number): Date {
    if (typeof expiresIn === 'number') {
      return new Date(Date.now() + expiresIn * 1000);
    }

    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const unitToMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    return new Date(Date.now() + value * unitToMs[unit]);
  }

  private stripSensitiveUserFields<T extends { passwordHash?: string }>(user: T) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
