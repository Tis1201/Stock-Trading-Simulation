import { Controller, Get, Body, Param, Delete, Query } from '@nestjs/common';
import { YahoostockService } from './yahoostock.service';
import { Public } from 'src/custom-decorator';

@Controller('api/yahoo')
export class YahoostockController {
  constructor(private readonly yahoostockService: YahoostockService) {}


}
