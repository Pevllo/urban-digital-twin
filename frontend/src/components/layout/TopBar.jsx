import { useState } from "react";
import { Box, Plane, Network, Layers } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { Branding } from "./Branding.jsx";

const NAV_ITEMS = [
  { key: "digital-twin", label: "Digital Twin" },
  { key: "scenarios", label: "Scenarios" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "data-layers", label: "Data Layers" },
];

const NAV_ICONS = {
  "digital-twin": Box,
  scenarios: Network,
  infrastructure: Plane,
  "data-layers": Layers,
};

export function TopBar({ onNavigate }) {
  const { state } = useApp();
  const [active, setActive] = useState("digital-twin");
  const backend = state.backend;
  const city = state.city.info;

  const statusConnected = backend.healthy;
  const statusOffline = !backend.healthy && !backend.checking;
  const checking = backend.checking;

  function navigate(key) {
    setActive(key);
    if (onNavigate) onNavigate(key);
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Branding />
      </div>

      <nav className="topbar-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.key];
          return (
            <button
              key={item.key}
              className={`nav-item${active === item.key ? " active" : ""}`}
              onClick={() => navigate(item.key)}
              type="button"
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="topbar-right">
        <div className="project-area">
          <span className="project-area-label">Project Area</span>
          <span className="project-area-value">
            {city?.name || "New Administrative Capital — R3"}
          </span>
        </div>
        <div
          className={`backend-status${statusOffline ? " offline" : ""}${checking ? " checking" : ""}`}
          role="status"
          aria-live="polite"
          title={backend.error || (statusConnected ? "Backend connected" : "Checking backend")}
        >
          <span className="status-dot" />
          <span className="status-text">
            {checking ? "CHECKING BACKEND" : statusConnected ? "BACKEND CONNECTED" : "BACKEND OFFLINE"}
          </span>
        </div>
      </div>
    </header>
  );
}
