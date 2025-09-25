import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_REQUIRED_PERMISSION } from 'src/custom-decorator';
import { UserService } from 'src/user/user.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  @Inject()
  private reflector: Reflector;

  @Inject()
  private userService: UserService;

  async canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user;
    if (!user) return true;

    const userPermission = await this.userService.getRolePermissionByUserId(
      Number(user.sub),
    );

    const permissions = userPermission.flatMap((role) =>
      role.permissions.map((p) => p.name),
    );

    const requiredPermission = this.reflector.getAllAndOverride<string[]>(
      IS_REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    // check xem user có ít nhất 1 quyền yêu cầu hay không
    const hasPermission = permissions.some((p) =>
      requiredPermission.includes(p),
    );

    if (!hasPermission) {
      throw new UnauthorizedException('Permission denied');
    }

    return true;
  }
}
