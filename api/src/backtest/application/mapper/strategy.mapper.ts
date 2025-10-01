import { StrategyDTO } from '../dto/create-backtest.dto';
import { StrategyEntity } from '../../domain/entities/strategy.entity';

export class StrategyMapper {
  static fromDto(dto: StrategyDTO): StrategyEntity {
    return {
      name: dto.name,
      description: dto.description,
      rules: dto.rules.map(r => ({
        rule_order: r.ruleOrder,  // camelCase → snake_case
        condition: r.condition,
        action: r.action,
      })),
    };
  }
}
