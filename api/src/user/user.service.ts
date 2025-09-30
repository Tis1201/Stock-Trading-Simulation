import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ErrorFactory } from '../common/errors';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    return await this.prisma.user.create({
      data: createUserDto,
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
      throw ErrorFactory.BusinessLogicError('Failed to update user', error);
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
}
