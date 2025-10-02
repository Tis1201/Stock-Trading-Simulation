import { Injectable } from '@nestjs/common';
import { ErrorFactory } from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  IStockPriceRepository,
  StockPriceCreateManyInput,
} from 'src/stock/domain/repositories.interfaces';

@Injectable()
export class PrismaStockPriceRepository implements IStockPriceRepository {
  constructor(private readonly prisma: PrismaService) {}
  async bulkInsertDailyPrices(rows: StockPriceCreateManyInput[]) {
    if (!rows.length) return { inserted: 0, skipped: 0 };
    try {
      const result = await this.prisma.stockPrice.createMany({
        data: rows as any[],
        skipDuplicates: true, // dựa trên @@unique(stock_symbol, trade_date)
      });
      return { inserted: result.count, skipped: rows.length - result.count };
    } catch (error) {
      throw ErrorFactory.BusinessLogicError(
        'Failed to insert daily prices',
        error,
      );
    }
  }
}
