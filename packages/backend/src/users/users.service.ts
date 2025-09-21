import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createWithTenant(input: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    tenantName: string;
  }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.tenantName
        }
      });

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          tenantId: tenant.id
        }
      });

      return { tenant, user };
    });
  }

  createEmailVerificationToken(userId: string, token: string, expiresAt: Date) {
    return this.prisma.emailVerificationToken.create({
      data: {
        userId,
        token,
        expiresAt
      }
    });
  }

  findValidEmailVerificationToken(userId: string, token: string) {
    return this.prisma.emailVerificationToken.findFirst({
      where: {
        userId,
        token,
        used: false,
        expiresAt: {
          gt: new Date()
        }
      }
    });
  }

  markEmailVerificationTokenUsed(id: string) {
    return this.prisma.emailVerificationToken.update({
      where: { id },
      data: { used: true }
    });
  }

  markEmailVerified(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true }
    });
  }

  createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
    return this.prisma.passwordResetToken.create({
      data: {
        userId,
        token,
        expiresAt
      }
    });
  }

  findValidPasswordResetToken(token: string) {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        token,
        used: false,
        expiresAt: {
          gt: new Date()
        }
      }
    });
  }

  markPasswordResetTokenUsed(id: string) {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { used: true }
    });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
  }

  createRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        token: tokenHash,
        expiresAt
      }
    });
  }

  listActiveRefreshTokens(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        revoked: false,
        expiresAt: {
          gt: new Date()
        }
      }
    });
  }

  revokeRefreshToken(id: string) {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revoked: true }
    });
  }

  revokeUserRefreshTokens(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true }
    });
  }
}
