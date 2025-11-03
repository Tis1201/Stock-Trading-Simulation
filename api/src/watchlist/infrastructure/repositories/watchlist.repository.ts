import { Watchlist } from 'src/watchlist/domain/entities/watchlist.entity';
import { IWatchlistRepository } from '../../domain/repositories/i-watchlist.repository';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginatedResult, Paginator } from '../../../utils/paginator';
import { WatchlistMapper } from '../persistence/mapper/watchlist.mapper';
import { ErrorFactory } from '../../../common/errors';
import { Prisma } from '@prisma/client';
@Injectable()
class WatchlistRepository implements IWatchlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAllWatchlist(
    page: number | string,
    limit: number | string,
  ): Promise<PaginatedResult<Watchlist>> {
    const paginator = new Paginator(page, limit);
    return paginator.paginatePrisma(
      this.prisma.watchlist.findMany({
        skip: paginator.offset,
        take: paginator.limit,
      }),
      this.prisma.watchlist.count(),
      (data) => WatchlistMapper.toDomain(data),
    );
  }
  async getWatchlistById(id: number): Promise<Watchlist> {
    const existingWatchlist = await this.prisma.watchlist.findFirst({
      where: { id: id },
    });
    if (!existingWatchlist) {
      throw ErrorFactory.NotFoundError('Notfound watchlist with id: ' + id);
    }
    return WatchlistMapper.toDomain(existingWatchlist);
  }

  async create(watchlist: Watchlist): Promise<Watchlist> {
    try {
      const prismaData = WatchlistMapper.toPersistence(watchlist);
      const newData = await this.prisma.watchlist.create({
        data: prismaData,
      });
      return WatchlistMapper.toDomain(newData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          throw ErrorFactory.PrismaUniqueConstraint(watchlist);
        }
      }
      throw e;
    }
  }
  async save(id: number, watchlist: Watchlist): Promise<Watchlist> {
    const existingWatchlist = await this.getWatchlistById(id);
    const prismaData = WatchlistMapper.toPersistence(watchlist);
    const updateData = await this.prisma.watchlist.update({
      data: watchlist,
      where: { id: id },
    });
    return WatchlistMapper.toDomain(updateData);
  }
  async delete(id: number): Promise<void> {
    const existingWatchlist = await this.getWatchlistById(id);
    await this.prisma.watchlist.delete({
      where: { id: id },
    });
  }
}
