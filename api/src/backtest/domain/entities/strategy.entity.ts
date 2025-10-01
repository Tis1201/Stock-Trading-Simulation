export class StrategyEntity {
  name!: string;
  description?: string;
  rules!: Array<{
    rule_order: number;
    condition: any;   // JSON
    action: 'BUY'|'SELL'|'HOLD';
  }>;
}
