import { Controller, Get, Query, Inject } from '@nestjs/common';
import { Public } from 'src/custom-decorator';
import { YahoostockService } from './yahoostock.service';
import { ImportVNQueryDto } from './dto/import-vn.query.dto';

// (tuỳ chọn) nếu muốn expose symbol/quote/ohlc từ controller:
import type { ISymbolProvider } from 'src/stock/domain/symbol-provider.interface';
import type { IMarketDataClient } from 'src/stock/domain/market-data.interfaces';

@Controller('api/yahoo')
export class YahoostockController {
  constructor(
    private readonly yahoostockService: YahoostockService,

    // hai inject dưới là tuỳ chọn (dùng cho endpoints debug)
    @Inject('ISymbolProvider') private readonly symbols?: ISymbolProvider,
    @Inject('IMarketDataClient') private readonly market?: IMarketDataClient,
  ) {}

  /**
   * Chạy import toàn bộ mã VN vào Stock & StockPrice.
   * Ví dụ:
   *   GET /api/yahoo/import-vn
   *   GET /api/yahoo/import-vn?limitSymbols=200&years=5&concurrency=6&throttleEvery=30&throttleMs=800
   */
  @Public()
  @Get('import-vn')
  async importAllVN(@Query() q: ImportVNQueryDto) {
    // Giá trị mặc định đã set ở service; DTO ở đây chỉ parse/validate
    return this.yahoostockService.getAllStockVN({
      limitSymbols: q.limitSymbols,
      years: q.years,
      concurrency: q.concurrency,
      throttleEvery: q.throttleEvery,
      throttleMs: q.throttleMs,
    });
  }

  /**
   * (Tuỳ chọn) Xem danh sách symbol sẽ dùng (không ghi DB) — tiện để kiểm tra.
   *   GET /api/yahoo/symbols
   *   GET /api/yahoo/symbols?limitSymbols=300
   */
  @Public()
  @Get('symbols')
  async getSymbols(@Query('limitSymbols') limitSymbols?: string) {
    if (!this.symbols) return { error: 'SymbolProvider not bound' };
    const limit = limitSymbols ? parseInt(limitSymbols, 10) : undefined;
    const list = await this.symbols.getAllVietnamSymbols(limit);
    return { total: list.length, data: list };
  }

  /**
   * (Tuỳ chọn) Lấy nhanh quote 1 mã để debug Yahoo.
   *   GET /api/yahoo/quote?symbol=VNM.VN
   */
  @Public()
  @Get('quote')
  async getQuote(@Query('symbol') symbol?: string) {
    if (!this.market) return { error: 'MarketDataClient not bound' };
    if (!symbol) return { error: 'symbol is required' };
    const data = await this.market.getQuote(symbol.toUpperCase());
    if (!data) return { symbol, error: 'No quote returned' };
    return data;
  }

  /**
   * (Tuỳ chọn) Lấy OHLC daily 1 mã trong khoảng thời gian để debug.
   *   GET /api/yahoo/ohlc?symbol=VNM.VN&years=1
   */
  @Public()
  @Get('ohlc')
  async getOhlc(
    @Query('symbol') symbol?: string,
    @Query('years') yearsStr?: string,
  ) {
    if (!this.market) return { error: 'MarketDataClient not bound' };
    if (!symbol) return { error: 'symbol is required' };

    const years = yearsStr ? parseInt(yearsStr, 10) : 1;
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - (Number.isFinite(years) ? years : 1));

    const rows = await this.market.getDailyOHLC(symbol.toUpperCase(), from, to);
    return { symbol: symbol.toUpperCase(), count: rows.length, data: rows };
  }

  @Public()
  @Get('stock')
  async getStock(@Query('page') page: number, @Query('limit') limit: number) {
    return this.yahoostockService.getStock(page, limit);
  }
}
