import { ALL_VN_STOCKS } from '../config/symbol';
import { ISymbolProvider } from '../domain/symbol-provider.interface';

export class VietnamTopSymbolProvider implements ISymbolProvider {
  async getAllVietnamSymbols(limit?: number): Promise<string[]> {
    const all = Array.from(new Set(ALL_VN_STOCKS.map((s) => s.toUpperCase())));
    if (!limit || limit <= 0 || limit >= all.length) return all;
    return all.slice(0, limit);
  }
}
