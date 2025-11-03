import { Watchlist } from '../entities/watchlist.entity';
import { PaginatedResult } from '../../../utils/paginator';

export interface IWatchlistRepository {
  getAllWatchlist(
    page: number | string,
    limit: number | string,
  ): Promise<PaginatedResult<Watchlist>>;
  getWatchlistById(id: number): Promise<Watchlist>;
  create(watchlist: Watchlist): Promise<Watchlist>;
  save(id: number, watchlist: Watchlist): Promise<Watchlist>;
  delete(id: number): Promise<void>;
}
