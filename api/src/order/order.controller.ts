// src/order/order.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from 'src/custom-decorator';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetUserOrdersDto } from './dto/get-user-orders.dto';

// 👉 dùng axios để gọi Yahoo Finance
import axios from 'axios';

@Controller('api/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * Tạo một order
   */
  @Public()
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateOrderDto) {
    const userId = (req as any).user?.id ?? 1;
    return this.orderService.createOrderForUser(userId, dto);
  }

  /**
   * Danh sách order của user
   */
  @Public()
  @Get()
  async list(@Req() req: Request, @Query() query: GetUserOrdersDto) {
    const userId = (req as any).user?.id ?? 1;
    return this.orderService.getUserOrders(userId, query);
  }

}
