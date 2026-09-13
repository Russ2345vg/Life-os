import type { DayDate } from '../../domain';
import type { CommandClarification } from './CommandClarification';

/** No application services or persistence are exposed to interpretation adapters. */
export interface CommandInterpreter {
  interpret(text: string, currentDate: DayDate): Promise<unknown>;
  clarify?(context: CommandClarification, answer: string, currentDate: DayDate): Promise<unknown>;
}
