import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type {
  IStockRepository,
  StockUpsertInput,
} from 'src/stock/domain/repositories.interfaces';
import { Injectable } from '@nestjs/common';
import { ErrorFactory } from 'src/common/errors';

@Injectable()
export class PrismaStockRepository implements IStockRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDecimalOrNull(v?: number | bigint | string | null) {
    if (v === undefined || v === null) return null;

    return new Prisma.Decimal(v.toString());
  }

  async upsertStock(data: StockUpsertInput): Promise<void> {
    try {
      return this.prisma.$transaction(async (tx) => {
        await tx.stock.upsert({
          where: { symbol: data.symbol },
          create: {
            symbol: data.symbol,
            company_name: data.company_name,
            exchange: data.exchange,
            sector: data.sector ?? null,
            industry: data.industry ?? null,
            market_cap: this.toDecimalOrNull(data.market_cap),
            is_active: data.is_active ?? true,
          },
          update: {
            company_name: data.company_name,
            exchange: data.exchange,
            sector: data.sector ?? null,
            industry: data.industry ?? null,
            market_cap: this.toDecimalOrNull(data.market_cap),
            is_active: data.is_active ?? true,
            updated_at: new Date(),
          },
        });
      });
    } catch (error) {
      throw ErrorFactory.BusinessLogicError('Failed to upsert stock', data);
    }
  }
}
