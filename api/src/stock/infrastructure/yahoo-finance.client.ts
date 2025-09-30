import {
  IMarketDataClient,
  OHLCPoint,
  QuoteLite,
} from '../domain/market-data.interfaces';
import { Injectable, Logger } from '@nestjs/common';
import yahooFinance from 'yahoo-finance2';

@Injectable()
export class YahooFinanceClient implements IMarketDataClient {
  async getDailyOHLC(symbol: string, from: Date, to: Date): Promise<OHLCPoint[]> {
    try {
      const chart = await yahooFinance.chart(symbol, {
        period1: from,
        period2: to,
        interval: '1d',
      });
     
      const price = chart?.quotes ?? [];
      return price.filter(p => p.open !== null && p.close !=null && p.low!=null && p.high!=null).map(p => ({
        date: new Date(p.date!),
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
        volume: Number(p.volume ?? 0),
        adjClose: (p as any).adjclose ?? null,
      }));
    } catch (error) {
      this.logger.warn(
        `getDailyOHLC failed for ${symbol}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private readonly logger = new Logger(YahooFinanceClient.name);

  async getQuote(symbol: string): Promise<QuoteLite | null> {
    try {
      const [summary, quote] = await Promise.all([
        yahooFinance.quoteSummary(symbol, {
          modules: ['assetProfile', 'summaryDetail', 'price'],
        }),
        yahooFinance.quote(symbol),
      ]);

      const profile: { sector?: string; industry?: string } =
        summary?.assetProfile ?? {};
      const summaryDetail = summary?.summaryDetail ?? {};
      const price = quote;

      if (!price?.symbol) return null;

      return {
        symbol: price.symbol,
        longName: (price as any).longName,
        shortName: price.shortName,
        exchange: price.exchange,
        currency: price.currency ?? 'VND',
        sector: profile.sector ?? null,
        industry: profile.industry ?? null,
        marketCap: (summaryDetail as any)?.marketCap ?? null,
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
