import { Injectable, Logger, Inject } from '@nestjs/common';
import { runWithConcurrency } from 'src/utils/concurrancy';
import { sleep, retry } from 'src/utils/async';

import type { ISymbolProvider } from 'src/stock/domain/symbol-provider.interface';
import type {
  IMarketDataClient,
  Interval,
} from 'src/stock/domain/market-data.interfaces';
import type {
  IStockRepository,
  IStockPriceRepository,
} from 'src/stock/domain/repositories.interfaces';

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
        const quote = await retry(() => this.market.getQuote(symbol), 3, 600);
        if (!quote) throw new Error('No quote');

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
          const res = await this.prices.bulkInsertDailyPrices(rows); // createMany({ skipDuplicates: true })
          inserted += res.inserted;
          skipped += res.skipped;
        }
      } catch (e) {
        errors.push({ symbol, error: (e as Error).message });
        this.logger.warn(`Symbol ${symbol} failed: ${(e as Error).message}`);
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
