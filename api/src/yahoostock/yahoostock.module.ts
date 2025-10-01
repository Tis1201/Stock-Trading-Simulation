// src/yahoostock/yahoostock.module.ts
import { Module } from '@nestjs/common';
import { YahoostockService } from './yahoostock.service';
import { YahoostockController } from './yahoostock.controller';
import { ConfigModule } from '@nestjs/config';
import { VietnamTopSymbolProvider } from 'src/stock/infrastructure/vietnam-symbol.provider';
import { YahooFinanceClient } from 'src/stock/infrastructure/yahoo-finance.client';
import { YahooAvailableSymbolProvider } from 'src/stock/infrastructure/yahoo-available-symbol.provider';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaStockRepository } from 'src/stock/infrastructure/prisma-stock.repository';
import { PrismaStockPriceRepository } from 'src/stock/infrastructure/prisma-stock-price.repository';

@Module({
  imports: [ConfigModule],
  controllers: [YahoostockController],
  providers: [
    YahoostockService,
    PrismaService,
    // repositories
    { provide: 'IStockRepository', useClass: PrismaStockRepository },
    { provide: 'IStockPriceRepository', useClass: PrismaStockPriceRepository },
    // market client
    { provide: 'IMarketDataClient', useClass: YahooFinanceClient },

    // base symbol provider
    { provide: 'BaseSymbolProvider', useClass: VietnamTopSymbolProvider },

    // filtered provider (cái này sẽ được inject vào YahoostockService)
    {
      provide: 'ISymbolProvider',
      useFactory: (base: VietnamTopSymbolProvider, market: YahooFinanceClient) => {
        // có thể truyền option concurrency/ttl nếu muốn
        return new YahooAvailableSymbolProvider(base, market, { concurrency: 6, ttlMs: 60 * 60 * 1000 });
      },
      inject: ['BaseSymbolProvider', 'IMarketDataClient'],
    },
  ],
  exports: [],
})
export class YahoostockModule {}
