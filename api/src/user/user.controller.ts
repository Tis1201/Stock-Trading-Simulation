// src/user/user.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Public, RequiredPermission } from 'src/custom-decorator';

@Controller('api/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Public()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Public()
  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.userService.getRolePermissionByUserId(Number(id));
  }

  @Patch(':id')
  @RequiredPermission('user.update')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(+id, updateUserDto);
  }

  @Delete(':id')
  @RequiredPermission('user.delete')
  remove(@Param('id') id: string) {
    return this.userService.remove(Number(id));
  }

  // ✅ NEW: GET /api/user/me/balance (auth required)
  @Get('me/balance')
  async getMyBalance(@Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub; // tuỳ payload JWT, chỉnh lại nếu bạn dùng field khác
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.userService.getMyBalance(Number(userId));
  }
}
