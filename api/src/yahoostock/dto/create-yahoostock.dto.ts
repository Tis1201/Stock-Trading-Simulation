// src/modules/market-data/dto/yahoo-finance.dto.ts
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Trading Period DTO
 */
export class TradingPeriodDto {
  @IsString()
  timezone: string;

  @IsNumber()
  start: number;

  @IsNumber()
  end: number;

  @IsNumber()
  gmtoffset: number;
}

/**
 * Current Trading Period DTO
 */
export class CurrentTradingPeriodDto {
  @ValidateNested()
  @Type(() => TradingPeriodDto)
  pre: TradingPeriodDto;

  @ValidateNested()
  @Type(() => TradingPeriodDto)
  regular: TradingPeriodDto;

  @ValidateNested()
  @Type(() => TradingPeriodDto)
  post: TradingPeriodDto;
}

/**
 * Meta Information DTO
 */
export class YahooMetaDto {
  @IsString()
  currency: string;

  @IsString()
  symbol: string;

  @IsString()
  exchangeName: string;

  @IsString()
  fullExchangeName: string;

  @IsString()
  instrumentType: string;

  @IsNumber()
  firstTradeDate: number;

  @IsNumber()
  regularMarketTime: number;

  @IsBoolean()
  hasPrePostMarketData: boolean;

  @IsNumber()
  gmtoffset: number;

  @IsString()
  timezone: string;

  @IsString()
  exchangeTimezoneName: string;

  @IsNumber()
  regularMarketPrice: number;

  @IsNumber()
  fiftyTwoWeekHigh: number;

  @IsNumber()
  fiftyTwoWeekLow: number;

  @IsNumber()
  regularMarketDayHigh: number;

  @IsNumber()
  regularMarketDayLow: number;

  @IsNumber()
  regularMarketVolume: number;

  @IsString()
  longName: string;

  @IsString()
  shortName: string;

  @IsNumber()
  chartPreviousClose: number;

  @IsNumber()
  priceHint: number;

  @ValidateNested()
  @Type(() => CurrentTradingPeriodDto)
  currentTradingPeriod: CurrentTradingPeriodDto;

  @IsString()
  dataGranularity: string;

  @IsString()
  range: string;

  @IsArray()
  @IsString({ each: true })
  validRanges: string[];
}

/**
 * Quote Data DTO (OHLCV)
 */
export class QuoteDto {
  @IsArray()
  @IsOptional()
  @Transform(({ value }) =>
    value?.map((v: number | null) => (v === null ? null : Number(v))),
  )
  low: (number | null)[];

  @IsArray()
  @IsOptional()
  @Transform(({ value }) =>
    value?.map((v: number | null) => (v === null ? null : Number(v))),
  )
  volume: (number | null)[];

  @IsArray()
  @IsOptional()
  @Transform(({ value }) =>
    value?.map((v: number | null) => (v === null ? null : Number(v))),
  )
  high: (number | null)[];

  @IsArray()
  @IsOptional()
  @Transform(({ value }) =>
    value?.map((v: number | null) => (v === null ? null : Number(v))),
  )
  open: (number | null)[];

  @IsArray()
  @IsOptional()
  @Transform(({ value }) =>
    value?.map((v: number | null) => (v === null ? null : Number(v))),
  )
  close: (number | null)[];
}

/**
 * Adjusted Close DTO
 */
export class AdjCloseDto {
  @IsArray()
  @IsOptional()
  @Transform(({ value }) =>
    value?.map((v: number | null) => (v === null ? null : Number(v))),
  )
  adjclose: (number | null)[];
}

/**
 * Indicators DTO
 */
export class IndicatorsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteDto)
  quote: QuoteDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjCloseDto)
  @IsOptional()
  adjclose?: AdjCloseDto[];
}

/**
 * Chart Result DTO
 */
export class ChartResultDto {
  @ValidateNested()
  @Type(() => YahooMetaDto)
  meta: YahooMetaDto;

  @IsArray()
  @IsNumber({}, { each: true })
  timestamp: number[];

  @ValidateNested()
  @Type(() => IndicatorsDto)
  indicators: IndicatorsDto;
}

/**
 * Chart Wrapper DTO
 */
export class ChartWrapperDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChartResultDto)
  result: ChartResultDto[];

  @IsOptional()
  error: unknown;
}

/**
 * Yahoo Finance Chart Response DTO
 */
export class YahooFinanceChartDto {
  @ValidateNested()
  @Type(() => ChartWrapperDto)
  chart: ChartWrapperDto;
}

/**
 * Processed Stock Price DTO for internal use
 */
export class ProcessedStockPriceDto {
  @IsString()
  symbol: string;

  @IsString()
  company_name: string;

  @Transform(({ value }) => new Date(value as string | number | Date))
  trade_date: Date;

  @IsNumber()
  open_price: number;

  @IsNumber()
  high_price: number;

  @IsNumber()
  low_price: number;

  @IsNumber()
  close_price: number;

  @IsNumber()
  volume: number;

  @IsOptional()
  @IsNumber()
  adjusted_close_price?: number;

  @IsString()
  currency: string;

  @IsString()
  exchange: string;
}

/**
 * Stock Price Response DTO for API responses
 */
export class StockPriceResponseDto {
  @IsString()
  symbol: string;

  @IsString()
  company_name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessedStockPriceDto)
  prices: ProcessedStockPriceDto[];

  @IsNumber()
  total_records: number;

  @Transform(({ value }) => new Date(value as string | number | Date))
  from_date: Date;

  @Transform(({ value }) => new Date(value as string | number | Date))
  to_date: Date;

  @IsString()
  data_source: string;

  @Transform(({ value }) => new Date(value as string | number | Date))
  last_updated: Date;
}

/**
 * Sector Breakdown DTO
 */
export class SectorBreakdownDto {
  @IsString()
  sector: string;

  @IsNumber()
  stock_count: number;

  @IsNumber()
  latest_total_volume: number;

  @IsNumber()
  avg_price_change: number;
}

/**
 * Market Overview DTO
 */
export class MarketOverviewDto {
  @IsNumber()
  total_stocks: number;

  @IsNumber()
  total_records: number;

  @Transform(({ value }) =>
    value ? new Date(value as string | number | Date) : null,
  )
  @IsOptional()
  data_from?: Date;

  @Transform(({ value }) =>
    value ? new Date(value as string | number | Date) : null,
  )
  @IsOptional()
  data_to?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectorBreakdownDto)
  sector_breakdown: SectorBreakdownDto[];
}

/**
 * Latest Stock Price DTO
 */
export class LatestStockPriceDto {
  @IsString()
  stock_symbol: string;

  @IsString()
  company_name: string;

  @Transform(({ value }) => new Date(value as string | number | Date))
  trade_date: Date;

  @IsNumber()
  close_price: number;

  @IsNumber()
  volume: number;

  @IsString()
  sector: string;

  @IsOptional()
  @IsNumber()
  price_change?: number;

  @IsOptional()
  @IsNumber()
  price_change_percent?: number;
}

/**
 * Fetch Request DTO
 */
export class FetchHistoricalDataDto {
  @IsString()
  symbol: string;

  @IsOptional()
  @IsString()
  period1?: string; // Start date in YYYY-MM-DD format

  @IsOptional()
  @IsString()
  period2?: string; // End date in YYYY-MM-DD format

  @IsOptional()
  @IsString()
  interval?: '1d' | '1wk' | '1mo'; // Default: 1d

  @IsOptional()
  @IsBoolean()
  include_dividends?: boolean; // Default: false
}

/**
 * Bulk Fetch Request DTO
 */
export class BulkFetchRequestDto {
  @IsArray()
  @IsString({ each: true })
  symbols: string[];

  @IsOptional()
  @IsString()
  period1?: string;

  @IsOptional()
  @IsString()
  period2?: string;

  @IsOptional()
  @IsString()
  interval?: '1d' | '1wk' | '1mo';

  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean; // Force re-fetch even if data exists
}

/**
 * API Error Response DTO
 */
export class ApiErrorResponseDto {
  @IsString()
  message: string;

  @IsString()
  error_code: string;

  @IsNumber()
  status_code: number;

  @Transform(({ value }) => new Date(value as string | number | Date))
  timestamp: Date;

  @IsOptional()
  details?: unknown;
}

/**
 * Success Response DTO
 */
export class ApiSuccessResponseDto<T = unknown> {
  @IsBoolean()
  success: true;

  @IsOptional()
  data?: T;

  @IsOptional()
  @IsString()
  message?: string;

  @Transform(({ value }) => new Date(value as string | number | Date))
  timestamp: Date;

  @IsOptional()
  @IsNumber()
  total_records?: number;
}
