import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Exclude, Expose, Type } from 'class-transformer';

export enum PriceSourceDTO {
  HISTORICAL = 'HISTORICAL',
  SIM_PRIVATE = 'SIM_PRIVATE',
  SIM_PUBLIC = 'SIM_PUBLIC',
}

@Exclude()
export class StrategyRuleDTO {
  @Expose()
  @IsInt()
  ruleOrder: number;

  @Expose()
  @IsObject()
  condition: Record<string, any>;

  @Expose()
  @IsEnum(['BUY', 'SELL', 'HOLD'])
  action: 'BUY' | 'SELL' | 'HOLD';
}

@Exclude()
export class StrategyDTO {
  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsOptional()
  description?: string;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => StrategyRuleDTO)
  rules: StrategyRuleDTO[];
}

@Exclude()
export class CreateBacktestDto {
  @Expose()
  @ValidateNested()
  @Type(() => StrategyDTO)
  strategy: StrategyDTO;

  @Expose()
  @IsDateString()
  dataFrom: string;

  @Expose()
  @IsDateString()
  dataTo: string;

  @Expose()
  @IsEnum(PriceSourceDTO)
  priceSource: PriceSourceDTO;

  @Expose()
  @IsOptional()
  @IsInt()
  sessionId?: number | null;

  @Expose()
  @IsNumber()
  @IsPositive()
  initialCapital: number;

  @Expose()
  @IsNumber()
  commissionRate: number;

  @Expose()
  @IsOptional()
  @IsObject()
  jobConfig?: Record<string, any>;
}
