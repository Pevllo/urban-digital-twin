import { useApp } from "../../store/AppContext.jsx";
import {
  DEVELOPMENT_SCHEMA_FIELDS,
  PROPERTY_FIELDS,
  getFieldsForType,
} from "../../config/developmentForm.js";

export function DevelopmentForm() {
  const { state, dispatch } = useApp();
  const dev = state.development;
  const { propertyFields } = getFieldsForType(dev.type);

  const setProperty = (key) => (e) => {
    const value = e.target.value === "" ? "" : Number(e.target.value);
    dispatch({ type: "SET_DEVELOPMENT_PROPERTY", key, value });
  };

  return (
    <div className="dev-form">
      <label className="field">
        <span className="field-label">{DEVELOPMENT_SCHEMA_FIELDS.name.label}</span>
        <input
          className="field-input"
          type="text"
          value={dev.name}
          placeholder={DEVELOPMENT_SCHEMA_FIELDS.name.placeholder}
          onChange={(e) => dispatch({ type: "SET_DEVELOPMENT_NAME", name: e.target.value })}
        />
      </label>

      {propertyFields.map((key) => {
        const field = PROPERTY_FIELDS[key];
        if (!field) return null;
        const value = dev.properties[key] ?? "";
        return (
          <label key={key} className="field">
            <span className="field-label">
              {field.label}
              <span className="field-unit">{field.unit}</span>
            </span>
            <input
              className="field-input"
              type="number"
              min={field.min}
              step={field.step}
              value={value}
              onChange={setProperty(key)}
            />
          </label>
        );
      })}

      <label className="field">
        <span className="field-label">{DEVELOPMENT_SCHEMA_FIELDS.floors.label}</span>
        <input
          className="field-input"
          type="number"
          min={DEVELOPMENT_SCHEMA_FIELDS.floors.min}
          max={DEVELOPMENT_SCHEMA_FIELDS.floors.max}
          step={DEVELOPMENT_SCHEMA_FIELDS.floors.step}
          value={dev.floors}
          onChange={(e) =>
            dispatch({ type: "SET_DEVELOPMENT_FLOORS", floors: Number(e.target.value) })
          }
        />
      </label>
    </div>
  );
}
