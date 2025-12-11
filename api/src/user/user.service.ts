// src/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ErrorFactory } from '../common/errors';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ TẠO USER + USER_BALANCE MẶC ĐỊNH 200.000.000
  async create(createUserDto: CreateUserDto): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo user
      const user = await tx.user.create({
        data: createUserDto,
      });

      // 2. Tạo UserBalance tương ứng (200M VNĐ)
      await tx.userBalance.create({
        data: {
          user_id: user.id,
          available_balance: 200_000_000, // 200.000.000 VNĐ
          frozen_balance: 0,
          total_invested: 0,
          total_pnl: 0,
        },
      });

      return user;
    });
  }

  async findAll() {
    return await this.prisma.user.findMany();
  }

  async findOne(id: number) {
    return await this.prisma.user.findFirst({
      where: { id: id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const existingUser = await this.findOne(id);
    if (!existingUser) {
      throw ErrorFactory.NotFoundError('User not found', existingUser);
    }
    try {
      return this.prisma.$transaction(async (tx) => {
        return await tx.user.update({
          where: { id: id },
          data: updateUserDto,
        });
      });
    } catch (error) {
      throw ErrorFactory.BusinessLogicError(
        'Failed to update user',
        updateUserDto,
      );
    }
  }

  async remove(id: number) {
    const existingUser = await this.findOne(id);
    if (!existingUser) {
      throw ErrorFactory.NotFoundError('User not found', existingUser);
    }
    try {
      return this.prisma.$transaction(async (tx) => {
        return await tx.user.delete({
          where: { id: id },
        });
      });
    } catch (error) {
      throw ErrorFactory.BusinessLogicError('Failed to remove user', error);
    }
  }

  async getRolePermissionByUserId(userId: number) {
    const userWithRoles = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!userWithRoles) {
      throw new Error('User not found');
    }

    return userWithRoles.roles.map((userRole) => ({
      role: {
        id: userRole.role.id,
        name: userRole.role.name,
        display_name: userRole.role.display_name,
      },
      permissions: userRole.role.permissions.map((rp) => ({
        id: rp.permission.id,
        name: rp.permission.name,
        display_name: rp.permission.display_name,
        resource: rp.permission.resource,
        action: rp.permission.action,
      })),
    }));
  }

  // ✅ THÊM: LẤY BALANCE + PORTFOLIO CỦA CHÍNH USER (ME)
  async getMyBalance(userId: number) {
    let [balance, portfolios] = await this.prisma.$transaction([
      this.prisma.userBalance.findUnique({
        where: { user_id: userId },
      }),
      this.prisma.userPortfolio.findMany({
        where: { user_id: userId },
        include: {
          stock: true,
        },
      }),
    ]);

    // Phòng TH vì lý do nào đó chưa có balance (data cũ) → tự tạo
    if (!balance) {
      balance = await this.prisma.userBalance.create({
        data: {
          user_id: userId,
          available_balance: 200_000_000,
          frozen_balance: 0,
          total_invested: 0,
          total_pnl: 0,
        },
      });
      portfolios = [];
    }

    return {
      userId,
      balance: {
        availableBalance: Number(balance.available_balance),
        frozenBalance: Number(balance.frozen_balance),
        totalInvested: Number(balance.total_invested),
        totalPnl: Number(balance.total_pnl),
        updatedAt: balance.updated_at,
      },
      portfolios: portfolios.map((p) => ({
        stockSymbol: p.stock_symbol,
        quantity: p.quantity,
        avgPrice: Number(p.avg_price),
        totalValue: Number(p.total_value),
        unrealizedPnl: Number(p.unrealized_pnl),
        stock: p.stock
          ? {
            name: p.stock.company_name,
            exchange: p.stock.exchange,
            sector: p.stock.sector,
          }
          : null,
      })),
    };
  }
}
