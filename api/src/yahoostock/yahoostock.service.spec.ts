import { Test, TestingModule } from '@nestjs/testing';
import { YahoostockService } from './yahoostock.service';

describe('YahoostockService', () => {
  let service: YahoostockService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [YahoostockService],
    }).compile();

    service = module.get<YahoostockService>(YahoostockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
