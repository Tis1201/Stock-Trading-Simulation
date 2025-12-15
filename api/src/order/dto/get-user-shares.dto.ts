import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class GetUserSharesBodyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  stocks!: string[];
}
