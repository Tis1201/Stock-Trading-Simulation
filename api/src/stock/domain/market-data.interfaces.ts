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

export interface IMarketDataClient {
  getQuote(symbol: string): Promise<QuoteLite | null>;
  getDailyOHLC(symbol: string, from: Date, to: Date): Promise<OHLCPoint[]>;
}