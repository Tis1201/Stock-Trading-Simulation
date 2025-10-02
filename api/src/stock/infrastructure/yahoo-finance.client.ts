import {
  IMarketDataClient,
  OHLCPoint,
  QuoteLite,
} from '../domain/market-data.interfaces';
import { Injectable } from '@nestjs/common';
import yahooFinance from 'yahoo-finance2';
import { YahooFinanceError } from 'src/common/errors/types/yahoo-finance2.error';

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

@Injectable()
export class YahooFinanceClient implements IMarketDataClient {
  async getDailyOHLC(
    symbol: string,
    from: Date,
    to: Date,
    interval: Interval = '1d',
  ): Promise<OHLCPoint[]> {
    try {
      const ysym = symbol.endsWith('.VN') ? symbol : `${symbol}.VN`;

      const chart: any = await yahooFinance.chart(ysym, {
        period1: from,
        period2: to,
        interval,
      });

      const quotes = chart?.quotes ?? [];
      if (!quotes.length) {
        throw YahooFinanceError.notFound(symbol);
      }

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
    } catch (err: any) {
      if (err.code === 'ETIMEDOUT') throw YahooFinanceError.timeout(err);
      if (err.code === 'ECONNREFUSED' || err.response?.status === 503) {
        throw YahooFinanceError.serviceUnavailable(err);
      }
      throw new YahooFinanceError(
        `YahooFinanceClient.getDailyOHLC failed for ${symbol}`,
        err,
      );
    }
  }

  async getQuote(symbol: string): Promise<QuoteLite> {
    try {
      const ysym = symbol.endsWith('.VN') ? symbol : `${symbol}.VN`;

      const [summary, price] = await Promise.all([
        yahooFinance.quoteSummary(ysym, {
          modules: ['assetProfile', 'summaryDetail', 'price'],
        }),
        yahooFinance.quote(ysym),
      ]);

      if (!price?.symbol) {
        throw YahooFinanceError.notFound(symbol);
      }

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
    } catch (err: any) {
      if (err.code === 'ETIMEDOUT') throw YahooFinanceError.timeout(err);
      if (err.code === 'ECONNREFUSED' || err.response?.status === 503) {
        throw YahooFinanceError.serviceUnavailable(err);
      }
      throw new YahooFinanceError(
        `YahooFinanceClient.getQuote failed for ${symbol}`,
        err,
      );
    }
  }
}
