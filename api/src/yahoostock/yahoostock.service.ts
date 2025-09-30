import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import yahooFinance from 'yahoo-finance2';

@Injectable()
export class YahoostockService {
  constructor(private readonly httpService: HttpService) {}

  async getAllStockVN() {}
}
