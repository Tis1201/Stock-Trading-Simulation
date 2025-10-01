import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

import { Public } from './custom-decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
}
