import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { LoginDto } from './dto/login.dto';
import { ErrorFactory } from 'src/common/errors';
import { RedisService } from 'src/redis/redis.service';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  createAccessToken(payload: any) {
    return this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_SECRET,
    });
  }

  createRefreshToken(payload: any) {
    return this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_SECRET,
    });
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ access_token: string; sessionId: string }> {
    const user = await this.userService.findByEmail(loginDto.email);
    if (!user) throw ErrorFactory.NotFoundError('User not found');
    if (user?.password_hash !== loginDto.password_hash)
      throw ErrorFactory.InvalidCredentialsError(
        'Username or password is incorrect',
        {
          email: loginDto.email,
          password: loginDto.password_hash,
        },
      );

    const userPermission = await this.userService.getRolePermissionByUserId(
      user.id,
    );

    const allRoles = userPermission.map((r) => r.role.name);
    const allPermissions = userPermission.flatMap((role) =>
      role.permissions.map((permission) => permission.name),
    );

    const payload = {
      sub: user.id,
      role: allRoles,
      permission: allPermissions,
    };
    const access_token = this.createAccessToken(payload);
    const refresh_token = this.createRefreshToken(payload);

    const sessionId = randomUUID();
    await this.redisService.set(
      `session:${sessionId}`,
      refresh_token,
      60 * 60 * 24 * 7,
    );

    return { access_token, sessionId };
  }
}
