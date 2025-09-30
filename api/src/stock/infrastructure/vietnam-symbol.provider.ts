// src/stocks/infrastructure/vietnam-symbol.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PaginatedResult } from 'src/utils/paginator';

export type Exchange = 'ALL' | 'HOSE' | 'HNX' | 'UPCOM' | 'TOP';

export abstract class ISymbolProvider {
  abstract getVietnamSymbols(
    page?: number,
    pageSize?: number,
    exchange?: Exchange,
    keepSuffix?: boolean
  ): Promise<PaginatedResult<string>>;

  abstract getAllVietnamSymbols(
    limit?: number,
    exchange?: Exchange,
    keepSuffix?: boolean
  ): Promise<string[]>;
}

@Injectable()
export class VietnamSymbolProvider implements ISymbolProvider {
  private readonly log = new Logger(VietnamSymbolProvider.name);
  private readonly dir = process.env.VN_SYMBOLS_DIR
    ? path.resolve(process.env.VN_SYMBOLS_DIR)
    : path.join(process.cwd(), 'config', 'symbols');

  private cache: Record<string, string[]> = {};

  private loadJson(name: 'all' | 'hose' | 'hnx' | 'upcom' | 'top'): string[] {
    if (!this.cache[name]) {
      const file = path.join(this.dir, `${name}.json`);
      if (!fs.existsSync(file)) {
        if (name === 'all') {
          const all = Array.from(new Set([
            ...this.loadJson('hose'),
            ...this.loadJson('hnx'),
            ...this.loadJson('upcom'),
          ])).sort();
          this.cache[name] = all;
          return all;
        }
        throw new Error(`Symbols file not found: ${file}`);
      }
      const raw = fs.readFileSync(file, 'utf8');
      const arr = JSON.parse(raw) as string[];
      this.cache[name] = arr;
      this.log.debug(`Loaded ${name}.json (${arr.length} symbols)`);
    }
    return this.cache[name];
  }

  private pick(exchange: Exchange): string[] {
    switch (exchange) {
      case 'HOSE': return this.loadJson('hose');
      case 'HNX':  return this.loadJson('hnx');
      case 'UPCOM':return this.loadJson('upcom');
      case 'TOP':  return this.loadJson('top');
      default:     return this.loadJson('all');
    }
  }

  private stripSuffix = (sym: string) => sym.replace(/\.VN$/i, '');

  async getVietnamSymbols(
    page = 1,
    pageSize = 100,
    exchange: Exchange = 'ALL',
    keepSuffix = false
  ): Promise<PaginatedResult<string>> {
    const source = this.pick(exchange);
    const totalItems = source.length;

    // chuẩn hoá page/limit theo Paginator của bạn
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 1;

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const p = Math.min(Math.max(1, page), Math.max(1, totalPages));
    const start = (p - 1) * pageSize;
    const end = start + pageSize;

    const slice = source.slice(start, end);
    const data = keepSuffix ? slice : slice.map(this.stripSuffix);

    return {
      data,
      metadata: {
        totalRecords: totalItems,
        firstPage: 1,
        lastPage: totalPages,
        page: p,
        limit: pageSize,
      },
    };
  }

  async getAllVietnamSymbols(
    limit = 999999,
    exchange: Exchange = 'ALL',
    keepSuffix = false
  ): Promise<string[]> {
    const source = this.pick(exchange);
    const list = source.slice(0, limit);
    return keepSuffix ? list : list.map(this.stripSuffix);
  }
}
