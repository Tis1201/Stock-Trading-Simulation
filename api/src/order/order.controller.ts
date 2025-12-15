import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetUserOrdersDto } from './dto/get-user-orders.dto';
import {
  GetUserSharesBodyDto,
} from './dto/get-user-shares.dto';

@Controller('api/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.orderService.createOrderForUser(userId, dto);
  }

  @Get()
  async list(@Req() req: any, @Query() query: GetUserOrdersDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.orderService.getUserOrders(userId, query);
  }

  @Post('shares')
  async shares(@Req() req: any, @Body() body: GetUserSharesBodyDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.orderService.getUserShares(userId, body.stocks);
  }
}
