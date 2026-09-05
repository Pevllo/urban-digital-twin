import { WORKFLOW_STEPS } from "../../utils/workflow.js";
import { Check } from "lucide-react";

export function WorkflowPanel({ activeStep }) {
  return (
    <div className="panel workflow-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-kicker">Workflow</span>
        </div>
      </div>
      <ul className="workflow-steps">
        {WORKFLOW_STEPS.map((step, index) => {
          const isActive = index === activeStep;
          const isComplete = index < activeStep;
          return (
            <li
              key={step.key}
              className={`workflow-step${isActive ? " active" : ""}${isComplete ? " complete" : ""}`}
            >
              <span className="workflow-indicator" aria-hidden="true">
                {isComplete ? <Check size={12} /> : index + 1}
              </span>
              <span className="workflow-label">{step.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
