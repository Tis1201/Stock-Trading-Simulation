import { Exclude, Expose } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';

@Exclude()
export class LoginDto {
  @Expose()
  @IsEmail()
  email: string;

  @Expose()
  @IsString()
  password_hash: string;
}
