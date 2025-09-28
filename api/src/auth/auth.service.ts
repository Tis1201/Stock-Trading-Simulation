import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { LoginDto } from './dto/login.dto';
import { ErrorFactory } from 'src/common/errors';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async createAccessToken(payload: any) {
    return this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET,
    });
  }

  async createRefreshToken(payload: any) {
    return this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_SECRET,
    });
  }

  async login(loginDto: LoginDto): Promise<{ access_token: string }> {
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
      email: user.email,
      sub: user.id,
      role: allRoles,
      permission: allPermissions,
    };

    return { access_token: this.jwtService.sign(payload) };
  }
}
