export interface ISymbolProvider {
  getAllVietnamSymbols(limit?: number): Promise<string[]>;
}
