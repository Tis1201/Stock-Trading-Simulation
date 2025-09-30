import { Module } from '@nestjs/common';
import { YahoostockService } from './yahoostock.service';
import { YahoostockController } from './yahoostock.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get<string>('BASE_URL'),
        timeout: configService.get<number>('API_TIMEOUT') || 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  controllers: [YahoostockController],
  providers: [YahoostockService],
  exports: [YahoostockModule],
})
export class YahoostockModule {}
