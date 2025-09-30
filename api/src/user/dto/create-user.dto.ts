import { Exclude, Expose } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

@Exclude()
export class CreateUserDto {
  @Expose()
  @IsEmail({}, { message: 'Please provide your email address.' })
  @MaxLength(255, { message: 'Email can not exceed 255 characters.' })
  email: string;

  @Expose()
  @IsString({ message: 'Please enter your pass word' })
  @Length(8, 100, { message: 'Password must be between 8 and 100 characters.' })
  password_hash: string;

  @Expose()
  @IsString({ message: 'Please provide your first name' })
  @MaxLength(100, { message: 'Last name can not exceed 100 characters.' })
  first_name: string;

  @Expose()
  @IsString({ message: 'Please provide your last name' })
  @MaxLength(100, { message: 'Last name can not exceed 100 characters.' })
  last_name: string;

  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Phone number can not exceed 20 characters.' })
  phone?: string;
}
