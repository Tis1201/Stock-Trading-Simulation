import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_REQUIRED_PERMISSION = 'requiredPermission';
export const RequiredPermission = (...permission: string[]) =>
  SetMetadata(IS_REQUIRED_PERMISSION, permission);
