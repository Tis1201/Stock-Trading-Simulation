import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ImportVNQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limitSymbols?: number;        // số mã cần import

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  years?: number;               // số năm lịch sử

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  concurrency?: number;         // số job chạy song song

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  throttleEvery?: number;       // sau mỗi N symbol thì nghỉ

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  throttleMs?: number;          // nghỉ bao nhiêu ms
}
