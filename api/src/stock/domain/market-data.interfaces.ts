export interface QuoteLite {
  symbol: string;
  longName?: string;
  shortName?: string;
  exchange?: string;
  currency?: string;
  sector?: string | null;
  industry?: string | null;
  marketCap?: number | null;
  regularMarketPrice?: number | null;
  regularMarketPreviousClose?: number | null;
  regularMarketChange?: number | null;
  regularMarketChangePercent?: number | null;
  regularMarketVolume?: number | null;
}

export interface OHLCPoint {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number | null;
}

export type Interval =
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

export interface IMarketDataClient {
  getDailyOHLC(
    symbol: string,
    from: Date,
    to: Date,
    interval?: Interval,   // 👈 optional, mặc định 1d
  ): Promise<OHLCPoint[]>;

  getQuote(symbol: string): Promise<QuoteLite | null>;
}