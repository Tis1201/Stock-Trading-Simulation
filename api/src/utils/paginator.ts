export interface PaginatedResult<T> {
  data: T[];
  metadata: {
    totalRecords: number;
    firstPage: number;
    lastPage: number;
    page: number;
    limit: number;
  };
}

export class Paginator {
  public page: number;
  public limit: number;
  public offset: number;

  constructor(page?: number | string, limit?: number | string) {
    this.limit = parseInt(limit as string, 10) || 5;
    if (this.limit < 1) this.limit = 5;

    this.page = parseInt(page as string, 10) || 1;
    if (this.page < 1) this.page = 1;

    this.offset = (this.page - 1) * this.limit;
  }

  getMetadata(totalRecords: number) {
    const totalPages =
      totalRecords === 0 ? 0 : Math.ceil(totalRecords / this.limit);
    return {
      totalRecords,
      firstPage: 1,
      lastPage: totalPages,
      page: this.page,
      limit: this.limit,
    };
  }

  async paginatePrisma<T>(
    prismaQuery: Promise<T[]>,
    countQuery: Promise<number>,
  ): Promise<PaginatedResult<T>> {
    const [data, total] = await Promise.all([prismaQuery, countQuery]);
    return {
      data,
      metadata: this.getMetadata(total),
    };
  }
}
