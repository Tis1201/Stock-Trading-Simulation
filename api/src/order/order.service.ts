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
   * Tạo 1 order cho user
   * Nếu status === 'filled' thì:
   *  - BUY: trừ tiền, upsert UserPortfolio (insert/update)
   *  - SELL: cộng tiền, giảm shares (atomic), update PnL, bán hết thì delete portfolio row
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

      // 0) Validate input
      if (!userId || userId <= 0) {
        throw new BadRequestException('userId không hợp lệ');
      }
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

      // 1) Kiểm tra mã cổ phiếu tồn tại
      const stock = await tx.stock.findUnique({
        where: { symbol: stockSymbol },
      });
      if (!stock) {
        throw new NotFoundException('Mã cổ phiếu không tồn tại');
      }

      // 2) Lấy (hoặc tạo) MarketSession
      let sessionId: number;

      if (dtoSessionId) {
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
        // Auto find/create PUBLIC active session for today
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
            },
          });
        }

        sessionId = session.id;
      }

      // 3) Create order
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
          status: status ?? 'pending',

          filled_quantity: filledQuantity != null ? filledQuantity : 0,
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

          filled_at: filledAt ? new Date(filledAt) : null,
        },
        include: {
          stock: true,
          session: true,
        },
      });

      // 4) Nếu chưa filled -> return
      if (order.status !== 'filled') {
        return order;
      }

      // 5) Chuẩn hoá filledQty + filledPrice
      const filledQty =
        order.filled_quantity != null && order.filled_quantity > 0
          ? order.filled_quantity
          : order.quantity;

      const filledPriceNumber =
        order.filled_price != null
          ? Number(order.filled_price)
          : order.price != null
            ? Number(order.price)
            : 0;

      const commissionNumber = order.commission ? Number(order.commission) : 0;

      if (filledQty <= 0 || filledPriceNumber <= 0) {
        return order; // không đủ dữ liệu để update portfolio/balance
      }

      // 6) Ensure userBalance exists
      let userBalance = await tx.userBalance.findUnique({
        where: { user_id: userId },
      });

      if (!userBalance) {
        userBalance = await tx.userBalance.create({
          data: { user_id: userId },
        });
      }

      const availableBalance = Number(userBalance.available_balance);
      const totalInvested = Number(userBalance.total_invested);
      const totalPnl = Number(userBalance.total_pnl);

      const portfolioKey = {
        user_id_stock_symbol: {
          user_id: userId,
          stock_symbol: stockSymbol,
        },
      };

      // =====================================
      // BUY
      // =====================================
      if (order.side === 'buy') {
        const cost = filledPriceNumber * filledQty + commissionNumber;
        const newAvailable = availableBalance - cost;
        const newTotalInvested = totalInvested + cost;

        if (newAvailable < 0) {
          throw new BadRequestException('Không đủ số dư để thực hiện lệnh mua');
        }

        // Update balance
        await tx.userBalance.update({
          where: { user_id: userId },
          data: {
            available_balance: new Prisma.Decimal(newAvailable),
            total_invested: new Prisma.Decimal(newTotalInvested),
          },
        });

        // Upsert portfolio (đảm bảo luôn insert/update)
        const before = await tx.userPortfolio.findUnique({
          where: portfolioKey,
          select: { quantity: true, avg_price: true },
        });

        if (!before) {
          // insert
          await tx.userPortfolio.create({
            data: {
              user_id: userId,
              stock_symbol: stockSymbol,
              quantity: filledQty,
              avg_price: new Prisma.Decimal(filledPriceNumber),
              total_value: new Prisma.Decimal(filledPriceNumber * filledQty),
              unrealized_pnl: new Prisma.Decimal(0),
              updated_at: new Date(),
            },
          });
        } else {
          // update quantity + recompute weighted avg
          const oldQty = before.quantity;
          const oldAvg = Number(before.avg_price);

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
        }

        return order;
      }

      // =====================================
      // SELL
      // =====================================
      if (order.side === 'sell') {
        const existing = await tx.userPortfolio.findUnique({
          where: portfolioKey,
        });

        if (!existing || existing.quantity < filledQty) {
          throw new BadRequestException('Không đủ cổ phiếu để bán');
        }

        const avgPriceNumber = Number(existing.avg_price);

        const revenue = filledPriceNumber * filledQty - commissionNumber;
        const realizedPnl = (filledPriceNumber - avgPriceNumber) * filledQty;

        const newAvailable = availableBalance + revenue;
        const newTotalInvested = totalInvested - avgPriceNumber * filledQty;
        const newTotalPnl = totalPnl + realizedPnl;

        // Update balance
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

        // Atomic decrement (avoid race)
        const dec = await tx.userPortfolio.updateMany({
          where: {
            user_id: userId,
            stock_symbol: stockSymbol,
            quantity: { gte: filledQty },
          },
          data: {
            quantity: { decrement: filledQty },
            updated_at: new Date(),
          },
        });

        if (dec.count === 0) {
          throw new BadRequestException('Không đủ cổ phiếu để bán (race)');
        }

        const latest = await tx.userPortfolio.findUnique({
          where: portfolioKey,
        });

        if (!latest) return order;

        if (latest.quantity <= 0) {
          // bán hết -> delete record cho sạch
          await tx.userPortfolio.delete({ where: portfolioKey });
          return order;
        }

        const newTotalValue = filledPriceNumber * latest.quantity;
        const newUnrealizedPnl = newTotalValue - avgPriceNumber * latest.quantity;

        await tx.userPortfolio.update({
          where: portfolioKey,
          data: {
            // avg_price giữ nguyên (AVG cost)
            total_value: new Prisma.Decimal(newTotalValue),
            unrealized_pnl: new Prisma.Decimal(newUnrealizedPnl),
            updated_at: new Date(),
          },
        });

        return order;
      }

      return order;
    });
  }

  /**
   * Lấy danh sách order của 1 user (phân trang + filter)
   */
  async getUserOrders(userId: number, query: GetUserOrdersDto) {
    const { limit = 50, offset = 0, status, sessionId, stockSymbol } = query;

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

  /**
   * (Tuỳ chọn) Hàm shares dùng cho POST /api/orders/shares
   * Trả shares theo danh sách symbols
   */
  async getUserShares(inputUserId: number, stocks: string[]) {
    const userId = Number(inputUserId);
    if (!userId || userId <= 0) {
      throw new BadRequestException('userId không hợp lệ');
    }

    if (!stocks || stocks.length === 0) {
      return { userId, shares: {}, data: [] };
    }

    const symbols = Array.from(
      new Set(stocks.map((s) => String(s).trim()).filter(Boolean)),
    );

    const rows = await this.prisma.userPortfolio.findMany({
      where: {
        user_id: userId,
        stock_symbol: { in: symbols },
      },
      select: {
        stock_symbol: true,
        quantity: true,
        avg_price: true,
        total_value: true,
        unrealized_pnl: true,
        updated_at: true,
      },
    });

    const shares: Record<string, number> = {};
    for (const sym of symbols) shares[sym] = 0;
    for (const r of rows) shares[r.stock_symbol] = r.quantity ?? 0;

    return { userId, shares, data: rows };
  }
}
