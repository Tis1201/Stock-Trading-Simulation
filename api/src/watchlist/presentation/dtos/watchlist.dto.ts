import { Exclude, Expose } from 'class-transformer';
import { IsBoolean, IsNumber, IsString } from 'class-validator';


@Exclude()
export class CreateWatchlistDto {

  @Expose()
  @IsNumber()
  user_id: number;

  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsString()
  description: string;

  @Expose()
  @IsBoolean()
  is_default: boolean;
}
