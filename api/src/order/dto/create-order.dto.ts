// src/order/dto/create-order.dto.ts
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsIn,
  IsNumber,
  IsString,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateOrderDto {
  // session_id
  @IsOptional()
  @IsInt()
  sessionId?: number;

  // user_id
  @IsOptional()
  @IsInt()
  userId?: number;

  // bot_id
  @IsOptional()
  @IsInt()
  botId?: number;

  // stock_symbol
  @IsString()
  stockSymbol: string; // ví dụ: "FPT.VN"

  // order_type
  @IsIn(['market', 'limit', 'stop'])
  orderType: 'market' | 'limit' | 'stop';

  // side
  @IsIn(['buy', 'sell'])
  side: 'buy' | 'sell';

  // quantity
  @IsInt()
  @IsPositive()
  quantity: number;

  // price (Decimal?)
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
  )
  price?: number;

  // status
  @IsIn(['pending', 'filled', 'cancelled', 'partial'])
  status: 'pending' | 'filled' | 'cancelled' | 'partial';

  // filled_quantity
  @IsOptional()
  @IsInt()
  @Min(0)
  filledQuantity?: number;

  // filled_price (Decimal?)
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
  )
  filledPrice?: number;

  // commission (Decimal, default 0)
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
  )
  commission?: number;

  // created_at (DB đã default now(), nhưng nếu FE gửi thì vẫn nhận)
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  // filled_at
  @IsOptional()
  @IsDateString()
  filledAt?: string;
}
