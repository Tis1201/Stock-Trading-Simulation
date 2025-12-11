import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, MarketMode } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetUserOrdersDto } from './dto/get-user-orders.dto';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tạo 1 order cho user (đặt lệnh BUY/SELL hoặc sync kết quả từ simulator)
   * Nếu status === 'filled' thì sẽ:
   *  - BUY: trừ tiền, tăng số cổ phiếu trong UserPortfolio
   *  - SELL: cộng tiền, giảm số cổ phiếu, cập nhật PnL
   */
  async createOrderForUser(userId: number, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const {
        sessionId: dtoSessionId,
        stockSymbol,
        quantity,
        orderType,
        side,
        price,
        status,
        filledQuantity,
        filledPrice,
        commission,
        filledAt,
        botId,
      } = dto;

      // 0. Validate input cơ bản
      if (!stockSymbol) {
        throw new BadRequestException('stockSymbol là bắt buộc');
      }
      if (quantity == null || quantity <= 0) {
        throw new BadRequestException('Số lượng phải lớn hơn 0');
      }
      if (!['market', 'limit', 'stop'].includes(orderType)) {
        throw new BadRequestException('orderType không hợp lệ');
      }
      if (!['buy', 'sell'].includes(side)) {
        throw new BadRequestException('side phải là "buy" hoặc "sell"');
      }

      // 1. Kiểm tra mã cổ phiếu có tồn tại
      const stock = await tx.stock.findUnique({
        where: { symbol: stockSymbol },
      });

      if (!stock) {
        throw new NotFoundException('Mã cổ phiếu không tồn tại');
      }

      // 2. Lấy (hoặc tạo) MarketSession phù hợp
      let sessionId: number;

      if (dtoSessionId) {
        // Client truyền sessionId cụ thể
        const session = await tx.marketSession.findUnique({
          where: { id: dtoSessionId },
        });

        if (!session) {
          throw new NotFoundException(
            `Market session id=${dtoSessionId} không tồn tại`,
          );
        }

        sessionId = session.id;
      } else {
        // Không truyền sessionId: tự tìm hoặc tạo session PUBLIC active hôm nay
        const now = new Date();
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
        );
        const endOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
          0,
          0,
          0,
        );

        // Tìm session PUBLIC active trong hôm nay
        let session = await tx.marketSession.findFirst({
          where: {
            mode: MarketMode.PUBLIC,
            is_active: true,
            session_date: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
          orderBy: { id: 'asc' },
        });

        if (!session) {
          // Nếu chưa có, tự tạo session PUBLIC mới
          const now2 = new Date();
          session = await tx.marketSession.create({
            data: {
              session_date: now2,
              mode: MarketMode.PUBLIC,
              owner_user_id: null,
              start_time: now2,
              current_time: now2,
              is_active: true,
              simulation_speed: 1,
              // end_time để null, sẽ cập nhật sau khi kết thúc
            },
          });
        }

        sessionId = session.id;
      }

      // 3. Tạo order (mở rộng data)
      const order = await tx.order.create({
        data: {
          session_id: sessionId,
          user_id: userId,
          bot_id: botId ?? null,
          stock_symbol: stockSymbol,
          order_type: orderType,
          side,
          quantity,
          price: price != null ? new Prisma.Decimal(price) : null,

          // nếu dto không gửi status thì mặc định pending
          status: status ?? 'pending',

          filled_quantity:
            filledQuantity != null ? filledQuantity : 0,
          filled_price:
            filledPrice != null
              ? new Prisma.Decimal(filledPrice)
              : price != null
                ? new Prisma.Decimal(price)
                : null,
          commission:
            commission != null
              ? new Prisma.Decimal(commission)
              : new Prisma.Decimal(0),

          // created_at DB đã có default
          filled_at: filledAt ? new Date(filledAt) : null,
        },
        include: {
          stock: true,
          session: true,
        },
      });

      // 4. Nếu order chưa "filled" thì chỉ trả order, không đụng tới balance/portfolio
      if (order.status !== 'filled') {
        return order;
      }

      // =====================================
      // 5. Áp dụng hiệu ứng tài chính khi lệnh đã FILLED
      // =====================================

      // Số lượng & giá khớp thực tế
      const filledQty = order.filled_quantity || order.quantity;
      const filledPriceNumber = order.filled_price
        ? Number(order.filled_price)
        : order.price
          ? Number(order.price)
          : 0;
      const commissionNumber = order.commission
        ? Number(order.commission)
        : 0;

      if (filledQty <= 0 || filledPriceNumber <= 0) {
        // Không có gì để cập nhật portfolio
        return order;
      }

      // 5.1. Đảm bảo userBalance tồn tại
      let userBalance = await tx.userBalance.findUnique({
        where: { user_id: userId },
      });

      if (!userBalance) {
        userBalance = await tx.userBalance.create({
          data: {
            user_id: userId,
            // dùng default trong schema: 100000, 0, 0, 0
          },
        });
      }

      const availableBalance = Number(userBalance.available_balance);
      const totalInvested = Number(userBalance.total_invested);
      const totalPnl = Number(userBalance.total_pnl);

      // 5.2. BUY → trừ tiền, tăng position
      if (order.side === 'buy') {
        const cost = filledPriceNumber * filledQty + commissionNumber;
        const newAvailable = availableBalance - cost;
        const newTotalInvested = totalInvested + cost;

        if (newAvailable < 0) {
          throw new BadRequestException('Không đủ số dư để thực hiện lệnh mua');
        }

        // Cập nhật UserBalance
        await tx.userBalance.update({
          where: { user_id: userId },
          data: {
            available_balance: new Prisma.Decimal(newAvailable),
            total_invested: new Prisma.Decimal(newTotalInvested),
          },
        });

        // Cập nhật / Tạo UserPortfolio
        const portfolioKey = {
          user_id_stock_symbol: {
            user_id: userId,
            stock_symbol: stockSymbol,
          },
        };

        const existingPortfolio = await tx.userPortfolio.findUnique({
          where: portfolioKey,
        });

        if (existingPortfolio) {
          const oldQty = existingPortfolio.quantity;
          const oldAvg = Number(existingPortfolio.avg_price);

          const newQty = oldQty + filledQty;
          const newAvg =
            (oldAvg * oldQty + filledPriceNumber * filledQty) / newQty;

          const newTotalValue = filledPriceNumber * newQty;
          const newUnrealizedPnl = newTotalValue - newAvg * newQty;

          await tx.userPortfolio.update({
            where: portfolioKey,
            data: {
              quantity: newQty,
              avg_price: new Prisma.Decimal(newAvg),
              total_value: new Prisma.Decimal(newTotalValue),
              unrealized_pnl: new Prisma.Decimal(newUnrealizedPnl),
              updated_at: new Date(),
            },
          });
        } else {
          const totalValue = filledPriceNumber * filledQty;
          await tx.userPortfolio.create({
            data: {
              user_id: userId,
              stock_symbol: stockSymbol,
              quantity: filledQty,
              avg_price: new Prisma.Decimal(filledPriceNumber),
              total_value: new Prisma.Decimal(totalValue),
              unrealized_pnl: new Prisma.Decimal(0), // tạm thời 0, sẽ update theo giá thị trường sau
              updated_at: new Date(),
            },
          });
        }
      }

      // 5.3. SELL → cộng tiền, giảm position, cập nhật realized PnL
      if (order.side === 'sell') {
        // Portfolio hiện tại phải có đủ cổ phiếu để bán
        const portfolioKey = {
          user_id_stock_symbol: {
            user_id: userId,
            stock_symbol: stockSymbol,
          },
        };

        const existingPortfolio = await tx.userPortfolio.findUnique({
          where: portfolioKey,
        });

        if (!existingPortfolio || existingPortfolio.quantity < filledQty) {
          throw new BadRequestException('Không đủ cổ phiếu để bán');
        }

        const revenue = filledPriceNumber * filledQty - commissionNumber;
        const avgPriceNumber = Number(existingPortfolio.avg_price);

        const realizedPnl =
          (filledPriceNumber - avgPriceNumber) * filledQty;

        const newQty = existingPortfolio.quantity - filledQty;
        const newAvailable = availableBalance + revenue;
        const newTotalInvested =
          totalInvested - avgPriceNumber * filledQty;
        const newTotalPnl = totalPnl + realizedPnl;

        // Cập nhật UserBalance
        await tx.userBalance.update({
          where: { user_id: userId },
          data: {
            available_balance: new Prisma.Decimal(newAvailable),
            total_invested: new Prisma.Decimal(
              newTotalInvested < 0 ? 0 : newTotalInvested,
            ),
            total_pnl: new Prisma.Decimal(newTotalPnl),
          },
        });

        // Cập nhật UserPortfolio
        if (newQty > 0) {
          const newTotalValue = filledPriceNumber * newQty;
          const newUnrealizedPnl = newTotalValue - avgPriceNumber * newQty;

          await tx.userPortfolio.update({
            where: portfolioKey,
            data: {
              quantity: newQty,
              // avg_price giữ nguyên (theo FIFO/AVG)
              total_value: new Prisma.Decimal(newTotalValue),
              unrealized_pnl: new Prisma.Decimal(newUnrealizedPnl),
              updated_at: new Date(),
            },
          });
        } else {
          // Bán hết → set về 0, hoặc bạn có thể delete luôn record này
          await tx.userPortfolio.update({
            where: portfolioKey,
            data: {
              quantity: 0,
              total_value: new Prisma.Decimal(0),
              unrealized_pnl: new Prisma.Decimal(0),
              updated_at: new Date(),
            },
          });
        }
      }

      return order;
    });
  }

  /**
   * Lấy danh sách order của 1 user (có phân trang + filter basic)
   */
  async getUserOrders(userId: number, query: GetUserOrdersDto) {
    const {
      limit = 50,
      offset = 0,
      status,
      sessionId,
      stockSymbol,
    } = query;

    const take = Number(limit) || 50;
    const skip = Number(offset) || 0;

    const where: Prisma.OrderWhereInput = {
      user_id: userId,
      ...(status && { status }),
      ...(sessionId && { session_id: Number(sessionId) }),
      ...(stockSymbol && { stock_symbol: stockSymbol }),
    };

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: {
          stock: true,
          session: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        limit: take,
        offset: skip,
      },
    };
  }
}
