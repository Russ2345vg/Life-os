import {
  PreparationRule,
  isPreparationCategory,
  isPreparationRuleCondition,
} from '../../../domain';
import type { PreparationRuleRecord } from '../records/PreparationRuleRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readBoolean,
  readEntityId,
  readIsoDate,
  readNullableString,
  readNumber,
  readString,
} from './RecordMapperSupport';

export class PreparationRuleRecordMapper {
  public static toRecord(rule: PreparationRule): PreparationRuleRecord {
    return {
      schemaVersion: 1,
      id: rule.id.toString(),
      condition: rule.condition,
      conditionValue: rule.conditionValue,
      category: rule.category,
      title: rule.title,
      required: rule.required,
      active: rule.active,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      version: rule.version,
    };
  }

  public static fromRecord(value: unknown): PreparationRule {
    assertRecordAndSchemaVersion(value);
    const condition = readString(value, 'condition');
    const category = readString(value, 'category');
    if (!isPreparationRuleCondition(condition)) throw invalidRecord('Неизвестное условие правила.');
    if (!isPreparationCategory(category)) throw invalidRecord('Неизвестная категория правила.');
    return PreparationRule.rehydrate({
      id: readEntityId(value, 'id'),
      condition,
      conditionValue: readNullableString(value, 'conditionValue'),
      category,
      title: readString(value, 'title'),
      required: readBoolean(value, 'required'),
      active: readBoolean(value, 'active'),
      createdAt: readIsoDate(value, 'createdAt'),
      updatedAt: readIsoDate(value, 'updatedAt'),
      version: readNumber(value, 'version'),
    });
  }
}
