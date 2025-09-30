import { Test, TestingModule } from '@nestjs/testing';
import { YahoostockController } from './yahoostock.controller';
import { YahoostockService } from './yahoostock.service';

describe('YahoostockController', () => {
  let controller: YahoostockController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [YahoostockController],
      providers: [YahoostockService],
    }).compile();

    controller = module.get<YahoostockController>(YahoostockController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
