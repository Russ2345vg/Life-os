import { getWalkReflectionStages, type Walk, type WalkReflectionTemplate } from '../../domain';
import {
  WALK_REFLECTION_TEMPLATE_OPTIONS,
  WALK_REFLECTION_TEMPLATE_PRESENTATION,
  getWalkReflectionStagePresentation,
} from './WalkReflectionPresentation';

interface WalkReflectionTemplateSelectorProps {
  readonly selectedTemplate: WalkReflectionTemplate;
  readonly isDisabled: boolean;
  readonly onSelect: (template: WalkReflectionTemplate) => void;
}

export function WalkReflectionTemplateSelector(props: WalkReflectionTemplateSelectorProps) {
  const stages = getWalkReflectionStages(props.selectedTemplate);
  return (
    <fieldset className="walk-reflection-template-selector" disabled={props.isDisabled}>
      <legend>
        Сценарий размышления <small>необязательно</small>
      </legend>
      <p className="walk-reflection-template-hint">
        Выберите мягкую последовательность вопросов или оставьте прогулку свободной.
      </p>
      <div className="walk-reflection-template-grid">
        {WALK_REFLECTION_TEMPLATE_OPTIONS.map((template) => {
          const presentation = WALK_REFLECTION_TEMPLATE_PRESENTATION[template];
          return (
            <label className="walk-reflection-template-option" key={template}>
              <input
                type="radio"
                name="walk-reflection-template"
                value={template}
                checked={props.selectedTemplate === template}
                onChange={() => props.onSelect(template)}
              />
              <strong>{presentation.label}</strong>
            </label>
          );
        })}
      </div>
      <p className="walk-reflection-template-selection-note" aria-live="polite">
        {WALK_REFLECTION_TEMPLATE_PRESENTATION[props.selectedTemplate].description}
      </p>
      {stages.length === 0 ? null : (
        <div className="walk-reflection-template-preview" aria-live="polite">
          <span>Этапы сопровождения</span>
          <ol>
            {stages.map((stage) => (
              <li key={stage}>{getWalkReflectionStagePresentation(stage).label}</li>
            ))}
          </ol>
        </div>
      )}
    </fieldset>
  );
}

interface WalkReflectionGuidancePanelProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onAdvance: () => void;
  readonly onDisable: () => void;
}

export function WalkReflectionGuidancePanel(props: WalkReflectionGuidancePanelProps) {
  if (props.walk.reflectionTemplate === null || props.walk.reflectionStage === null) return null;
  const stages = getWalkReflectionStages(props.walk.reflectionTemplate);
  const stageIndex = stages.indexOf(props.walk.reflectionStage);
  if (stageIndex < 0) return null;
  const template = WALK_REFLECTION_TEMPLATE_PRESENTATION[props.walk.reflectionTemplate];
  const stage = getWalkReflectionStagePresentation(props.walk.reflectionStage);
  const isLastStage = stageIndex === stages.length - 1;

  return (
    <section className="walk-reflection-guidance" aria-labelledby="walk-reflection-guidance-title">
      <div className="walk-reflection-guidance-heading">
        <div>
          <span>{template.label}</span>
          <strong id="walk-reflection-guidance-title">{stage.label}</strong>
        </div>
        <small>
          Этап {stageIndex + 1} из {stages.length}
        </small>
      </div>
      <p className="walk-reflection-guidance-prompt" aria-live="polite">
        {stage.prompt}
      </p>
      <div className="walk-reflection-guidance-actions">
        <button
          className="primary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onAdvance}
        >
          {isLastStage ? 'Завершить сопровождение' : 'Следующий этап'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onDisable}
        >
          Без сопровождения
        </button>
      </div>
    </section>
  );
}
