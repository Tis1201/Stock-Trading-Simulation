// DTO để query danh sách order của user (query params)

export class GetUserOrdersDto {
  /** offset = số bản ghi bỏ qua (dùng cho phân trang kiểu page/limit) */
  offset?: number;

  /** limit = số bản ghi mỗi lần lấy */
  limit?: number;

  /** Filter theo trạng thái: "pending" | "filled" | "cancelled" | ... */
  status?: string;

  /** Filter theo session cụ thể */
  sessionId?: number;

  /** Filter theo mã cổ phiếu */
  stockSymbol?: string;
}
