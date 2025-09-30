import { Module, OnModuleInit } from '@nestjs/common';
import { RedisService } from './redis.service';

@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule implements OnModuleInit {
  constructor(private readonly redisService: RedisService) {}
  async onModuleInit() {
    return await this.redisService.connect();
  }
}
