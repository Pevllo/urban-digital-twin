import { useApp } from "../../store/AppContext.jsx";
import { DEVELOPMENT_TYPES } from "../../types/developments.js";

export function DevelopmentTypeSelector() {
  const { state, dispatch } = useApp();
  const currentType = state.development.type;

  return (
    <div className="dev-type-grid">
      {DEVELOPMENT_TYPES.map((type) => {
        const isActive = type.value === currentType;
        return (
          <button
            key={type.value}
            className={`dev-type${isActive ? " active" : ""}`}
            onClick={() => dispatch({ type: "SET_DEVELOPMENT_TYPE", devType: type.value })}
            aria-pressed={isActive}
            type="button"
          >
            <span className="dev-type-label">{type.label}</span>
            <span className="dev-type-desc">{type.description}</span>
          </button>
        );
      })}
    </div>
  );
}
