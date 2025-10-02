export interface StockUpsertInput {
  symbol: string;
  company_name: string;
  exchange: string;
  sector?: string | null;
  industry?: string | null;
  market_cap?: bigint | null; // map number -> bigint
  is_active?: boolean;
}

export interface IStockRepository {
  upsertStock(data: StockUpsertInput): Promise<void>;
}

export interface StockPriceCreateManyInput {
  stock_symbol: string;
  trade_date: Date;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: bigint;
  adjusted_close_price?: number | null;
}

export interface IStockPriceRepository {
  bulkInsertDailyPrices(
    rows: StockPriceCreateManyInput[],
  ): Promise<{ inserted: number; skipped: number }>;
}