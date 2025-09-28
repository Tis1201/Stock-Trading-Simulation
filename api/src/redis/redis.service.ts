import { Injectable, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private client: Redis;

  private validateEnvironment() {
    if (!process.env.REDIS_HOST) {
      throw new Error('REDIS_HOST environment variable is required');
    }

    const port = parseInt(process.env.REDIS_PORT || '6379');
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(
        'REDIS_PORT must be a valid port number between 1 and 65535',
      );
    }

    return { host: process.env.REDIS_HOST, port };
  }

  onModuleInit() {
    const { host, port } = this.validateEnvironment();

    this.client = new Redis({
      host,
      port,
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.client.on('connect', () => {
      console.log(
        `Connected to Redis at ${this.client.options.host}:${this.client.options.port}`,
      );
    });

    this.client.on('error', (error) => {
      console.error('Redis error:', error);
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  getClient(): Redis {
    return this.client;
  }

  async set(key: string, value: string, ttl?: number) {
    const val = JSON.stringify(value);
    if (ttl) {
      await this.client.set(key, val, 'EX', ttl);
    } else {
      await this.client.set(key, val);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string) {
    await this.client.del(key);
  }
}
