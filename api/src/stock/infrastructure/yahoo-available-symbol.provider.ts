
import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import type { ISymbolProvider } from '../domain/symbol-provider.interface';
import type { IMarketDataClient } from '../domain/market-data.interfaces';
import { Concurrency } from 'src/utils/concurrancy';

interface YahooAvailableOptions {
  concurrency?: number; 
  ttlMs?: number;       
}

@Injectable()
export class YahooAvailableSymbolProvider implements ISymbolProvider {
  private readonly logger = new Logger(YahooAvailableSymbolProvider.name);
  private readonly pool: Concurrency;
  private readonly ttlMs: number;

  // cache: symbol có sẵn
  private okCache = new Map<string, number>();     // symbol -> expiresAt
  // cache: symbol fail (no quote) để skip lần sau
  private badCache = new Map<string, number>();    // symbol -> expiresAt

  constructor(
    @Inject('BaseSymbolProvider') private readonly base: ISymbolProvider,
    @Inject('IMarketDataClient') private readonly market: IMarketDataClient,
    @Optional() opts?: YahooAvailableOptions,
  ) {
    const concurrency = opts?.concurrency ?? 6;
    this.ttlMs = opts?.ttlMs ?? 1000 * 60 * 60; // 1h
    this.pool = new Concurrency(concurrency);
  }

  private isFresh(map: Map<string, number>, symbol: string) {
    const exp = map.get(symbol);
    return !!exp && exp > Date.now();
  }

  private setFresh(map: Map<string, number>, symbol: string) {
    map.set(symbol, Date.now() + this.ttlMs);
  }

  private async isYahooAvailable(symbol: string): Promise<boolean> {
    // cache hit
    if (this.isFresh(this.okCache, symbol)) return true;
    if (this.isFresh(this.badCache, symbol)) return false;

    try {
      const q = await this.market.getQuote(symbol);
      if (q && q.symbol) {
        this.setFresh(this.okCache, symbol);
        this.badCache.delete(symbol);
        return true;
      }
    } catch (e) {
      // ignore, will be treated as not available
      this.logger.debug(`Quote check failed for ${symbol}: ${(e as Error).message}`);
    }
    this.setFresh(this.badCache, symbol);
    this.okCache.delete(symbol);
    return false;
  }

  async getAllVietnamSymbols(limit = Number.POSITIVE_INFINITY): Promise<string[]> {
    // lấy danh sách thô từ provider gốc
    const raw = await this.base.getAllVietnamSymbols(Number.POSITIVE_INFINITY);

    // kiểm tra khả dụng song song có giới hạn
    const flags = await this.pool.map(raw, async (sym) => (await this.isYahooAvailable(sym)) ? sym : null);
    const filtered = flags.filter((s): s is string => !!s);

    // cắt theo limit
    return filtered.slice(0, limit);
  }

  // tuỳ chọn: hàm warmup để build cache trước khi import
  async warmup(limitBase = 500) {
    const raw = await this.base.getAllVietnamSymbols(limitBase);
    await this.pool.map(raw, async (sym) => { await this.isYahooAvailable(sym); return null; });
    this.logger.log(`Warmup done. okCache=${this.okCache.size}, badCache=${this.badCache.size}`);
  }
}
