import { Injectable, Logger, Inject } from '@nestjs/common';
import { runWithConcurrency } from 'src/utils/concurrancy';


import type { ISymbolProvider } from 'src/stock/domain/symbol-provider.interface';
import type {
  IMarketDataClient,
  Interval,
} from 'src/stock/domain/market-data.interfaces';
import type {
  IStockRepository,
  IStockPriceRepository,
} from 'src/stock/domain/repositories.interfaces';

import { YahooFinanceError } from 'src/common/errors/types/yahoo-finance2.error';
import { retry, sleep } from 'src/utils/async';

export interface ImportOptions {
  limitSymbols?: number;
  years?: number;
  concurrency?: number;
  throttleEvery?: number;
  throttleMs?: number;
  interval?: Interval;
}

@Injectable()
export class YahoostockService {
  private readonly logger = new Logger(YahoostockService.name);

  constructor(
    @Inject('ISymbolProvider') private readonly symbols: ISymbolProvider,
    @Inject('IMarketDataClient') private readonly market: IMarketDataClient,
    @Inject('IStockRepository') private readonly stocks: IStockRepository,
    @Inject('IStockPriceRepository')
    private readonly prices: IStockPriceRepository,
  ) {}

  async getStock(page: number, limit: number) {
    return this.stocks.getStock(page, limit);
  }

  async getAllStockVN(opts: ImportOptions = {}) {
    const {
      limitSymbols = Number.POSITIVE_INFINITY,
      years = 5,
      concurrency = 6,
      throttleEvery = 30,
      throttleMs = 800,
      interval = '1d',
    } = opts;

    const list = await this.symbols.getAllVietnamSymbols(limitSymbols);
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - years);

    let done = 0;
    let inserted = 0;
    let skipped = 0;
    const errors: { symbol: string; error: string }[] = [];

    await runWithConcurrency(list, concurrency, async (symbol, idx) => {
      if (idx > 0 && idx % throttleEvery === 0) {
        await sleep(throttleMs); // throttle mềm giữa các cụm symbol
      }

      try {
        // lấy quote
        const quote = await retry(() => this.market.getQuote(symbol), 3, 600);
        if (!quote) {
          throw YahooFinanceError.notFound(symbol);
        }

        // upsert stock vào DB
        await this.stocks.upsertStock({
          symbol: quote.symbol,
          company_name: quote.longName ?? quote.shortName ?? quote.symbol,
          exchange: (quote.exchange ?? 'VN').toUpperCase(),
          sector: quote.sector ?? null,
          industry: quote.industry ?? null,
          market_cap:
            quote.marketCap != null
              ? BigInt(Math.trunc(quote.marketCap))
              : null,
          is_active: true,
        });

        // lấy OHLC
        const bars = await retry(
          () => this.market.getDailyOHLC(symbol, from, to, interval),
          3,
          600,
        );

        if (bars.length) {
          const rows = bars.map((b) => ({
            stock_symbol: symbol,
            trade_date: b.date,
            open_price: b.open,
            high_price: b.high,
            low_price: b.low,
            close_price: b.close,
            volume: BigInt(Math.max(0, b.volume)),
            adjusted_close_price: b.adjClose ?? null,
          }));
          const res = await this.prices.bulkInsertDailyPrices(rows); 
          inserted += res.inserted;
          skipped += res.skipped;
        }
      } catch (e) {
        // phân biệt error domain vs unexpected
        if (e instanceof YahooFinanceError) {
          this.logger.warn(`[YahooFinance] Symbol ${symbol} failed: ${e.message}`);
          errors.push({ symbol, error: e.message });
        } else {
          const err = e as Error;
          this.logger.error(`[System] Symbol ${symbol} failed`, err.stack);
          errors.push({ symbol, error: err.message });
        }
      } finally {
        done++;
        if (done % 20 === 0) {
          this.logger.log(`[${done}/${list.length}] imported so far…`);
        }
      }
    });

    return {
      totalSymbols: list.length,
      success: list.length - errors.length,
      failed: errors.length,
      insertedPrices: inserted,
      skippedPrices: skipped,
      errors,
    };
  }
}
