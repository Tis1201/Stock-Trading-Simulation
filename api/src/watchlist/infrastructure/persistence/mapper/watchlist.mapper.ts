import { Watchlist as PrismaWatchlist } from '@prisma/client';
import { Watchlist } from '../../../domain/entities/watchlist.entity';

export class WatchlistMapper {
  public static toDomain(prismadata: PrismaWatchlist): Watchlist {
    return new Watchlist(
      prismadata.id,
      prismadata.user_id,
      prismadata.name,
      prismadata.description,
      prismadata.is_default,
    );
  }

  public static toPersistence(entity: Watchlist) {
    return {
      id: entity.id,
      user_id: entity.user_id,
      name: entity.name,
      description: entity.description,
      is_default: entity.is_default,
    };
  }
}
