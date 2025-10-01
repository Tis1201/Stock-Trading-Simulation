import {
  IMarketDataClient,
  OHLCPoint,
  QuoteLite,
} from '../domain/market-data.interfaces';
import { Injectable, Logger } from '@nestjs/common';
import yahooFinance from 'yahoo-finance2';

type Interval =
  | '1m'
  | '2m'
  | '5m'
  | '15m'
  | '30m'
  | '60m'
  | '90m'
  | '1h'
  | '1d'
  | '5d'
  | '1wk'
  | '1mo'
  | '3mo';

// Nếu muốn dùng type cho options
type ChartOptions = {
  period1: Date | number;
  period2?: Date | number;
  interval?: string;
};

@Injectable()
export class YahooFinanceClient implements IMarketDataClient {
  private readonly logger = new Logger(YahooFinanceClient.name);

  async getDailyOHLC(
    symbol: string,
    from: Date,
    to: Date,
    interval: Interval = '1d',
  ): Promise<OHLCPoint[]> {
    try {
      const opts: ChartOptions = { period1: from, period2: to, interval };
      const ysym = symbol.endsWith('.VN') ? symbol : `${symbol}.VN`;

      // cast chart -> any để tránh TS complain
      const chart: any = await yahooFinance.chart(
        symbol.endsWith('.VN') ? symbol : `${symbol}.VN`,
        {
          period1: from,
          period2: to,
          interval: interval as
            | '1m'
            | '2m'
            | '5m'
            | '15m'
            | '30m'
            | '60m'
            | '90m'
            | '1h'
            | '1d'
            | '5d'
            | '1wk'
            | '1mo'
            | '3mo',
        },
      );

      const quotes = chart?.quotes ?? [];
      const isDailyLike = ['1d', '5d', '1wk', '1mo', '3mo'].includes(interval);
      const adj = chart?.indicators?.adjclose?.[0]?.adjclose ?? [];

      return quotes
        .filter(
          (q: any) =>
            q.open != null &&
            q.high != null &&
            q.low != null &&
            q.close != null,
        )
        .map((q: any, i: number) => ({
          date: new Date(q.date!),
          open: Number(q.open),
          high: Number(q.high),
          low: Number(q.low),
          close: Number(q.close),
          volume: Number(q.volume ?? 0),
          adjClose: isDailyLike ? (adj[i] ?? null) : null,
        }));
    } catch (e) {
      this.logger.warn(`getOHLC(${symbol}) failed: ${(e as Error).message}`);
      return [];
    }
  }

  async getQuote(symbol: string): Promise<QuoteLite | null> {
    try {
      const ysym = symbol.endsWith('.VN') ? symbol : `${symbol}.VN`;
      const [summary, price] = await Promise.all([
        yahooFinance.quoteSummary(ysym, {
          modules: ['assetProfile', 'summaryDetail', 'price'],
        }),
        yahooFinance.quote(ysym),
      ]);

      if (!price?.symbol) return null;

      const profile: any = summary?.assetProfile ?? {};
      const summaryDetail: any = summary?.summaryDetail ?? {};
      const longName =
        (price as any)?.longName ??
        (summary as any)?.price?.longName ??
        price.shortName;

      return {
        symbol: price.symbol,
        longName,
        shortName: price.shortName,
        exchange: price.exchange,
        currency: price.currency ?? 'VND',
        sector: profile.sector ?? null,
        industry: profile.industry ?? null,
        marketCap: summaryDetail?.marketCap ?? null,
        regularMarketPrice: price.regularMarketPrice ?? null,
        regularMarketPreviousClose: price.regularMarketPreviousClose ?? null,
        regularMarketChange: price.regularMarketChange ?? null,
        regularMarketChangePercent: price.regularMarketChangePercent ?? null,
        regularMarketVolume: price.regularMarketVolume ?? null,
      };
    } catch (e) {
      this.logger.warn(
        `getQuote failed for ${symbol}: ${(e as Error).message}`,
      );
      return null;
    }
  }
}
