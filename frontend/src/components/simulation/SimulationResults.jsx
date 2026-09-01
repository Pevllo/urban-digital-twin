import { useState } from "react";

const IMPACT_COLORS = {
  LOW: "#22c55e",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  SEVERE: "#ef4444",
};

function fmt(n, decimals = 1) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(1)}%`;
}

function Badge({ children, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        fontWeight: 600,
        background: color || "#1e293b",
        color: "#e2e8f0",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="sim-section">
      <span className="eyebrow">{title}</span>
      {children}
    </div>
  );
}

function DataRow({ label, value, unit }) {
  return (
    <div className="sim-row">
      <span>{label}</span>
      <strong>
        {value}
        {unit ? ` ${unit}` : ""}
      </strong>
    </div>
  );
}

export default function SimulationResults({ simulationResult }) {
  const [showTech, setShowTech] = useState(false);

  if (!simulationResult) return null;

  const dev = simulationResult.development_input || {};
  const hour = simulationResult.hour;
  const stage1 = simulationResult.stage1_od_demand;
  const stage2 = simulationResult.stage2_assignment;
  const stage3 = simulationResult.stage3_scenario_traffic;
  const stage4 = simulationResult.stage4_impact_assessment;
  const stage5 = simulationResult.stage5_electricity;

  const impactLevel = stage4?.overall_impact_level;
  const impactColor = IMPACT_COLORS[impactLevel] || "#64748b";

  return (
    <div className="sim-results">
      {/* ===========================================================
          SIMULATION SUMMARY
      =========================================================== */}

      <Section title="SIMULATION SUMMARY">
        <div className="sim-card">
          <DataRow label="Development" value={dev.development_type || "—"} />
          <DataRow label="Zone" value={dev.zone_id || "—"} />
          <DataRow label="Hour" value={hour ?? "—"} />
          {stage4 && (
            <>
              <DataRow
                label="Impact Level"
                value={
                  <Badge color={impactColor}>{impactLevel || "—"}</Badge>
                }
              />
              <DataRow
                label="Affected Roads"
                value={stage4.number_of_affected_roads ?? "—"}
              />
            </>
          )}
        </div>
      </Section>

      {/* ===========================================================
          TRIP DEMAND
      =========================================================== */}

      {stage1 && (
        <Section title="TRIP DEMAND">
          <div className="sim-card">
            <DataRow
              label="Daily Trips"
              value={fmt(stage1.total_trips)}
            />
            <DataRow
              label="Origin Zone"
              value={stage1.origin_zone || "—"}
            />
            <DataRow
              label="Type"
              value={stage1.development_type || "—"}
            />
            {stage1.od_matrix && stage1.od_matrix.length > 0 && (
              <div className="sim-subtable">
                <span className="sim-subtable-label">Top OD Flows</span>
                <table>
                  <thead>
                    <tr>
                      <th>Origin</th>
                      <th>Destination</th>
                      <th style={{ textAlign: "right" }}>Trips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage1.od_matrix.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        <td>{row.origin_zone}</td>
                        <td>{row.destination_zone}</td>
                        <td style={{ textAlign: "right" }}>
                          {fmt(row.trips)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stage1.od_matrix.length > 5 && (
                  <span className="sim-more">
                    +{stage1.od_matrix.length - 5} more flows
                  </span>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ===========================================================
          TRAFFIC IMPACT
      =========================================================== */}

      {stage4 && (
        <Section title="TRAFFIC IMPACT">
          <div className="sim-card">
            <DataRow
              label="Total Trips"
              value={fmt(stage4.total_development_trips)}
            />
            <DataRow
              label="External Trips"
              value={fmt(stage4.assigned_external_trips)}
            />
            <DataRow
              label="Internal Trips"
              value={fmt(stage4.unassigned_internal_trips)}
            />

            <div className="sim-divider" />

            <DataRow
              label="Roads Worsened"
              value={`${stage4.roads_worsened_count ?? 0} / ${stage4.number_of_affected_roads ?? 0}`}
            />
            <DataRow
              label="LOS E/F Roads"
              value={stage4.roads_reaching_los_E_or_F_count ?? 0}
            />
            <DataRow
              label="V/C ≥ 1.0 Roads"
              value={stage4.roads_reaching_vc_1_or_more_count ?? 0}
            />

            <div className="sim-divider" />

            <DataRow
              label="Max Δ Traffic"
              value={fmt(stage4.max_delta_traffic_veh_h)}
              unit="veh/h"
            />
            <DataRow
              label="Avg Δ Traffic"
              value={fmt(stage4.average_delta_traffic_veh_h)}
              unit="veh/h"
            />
            <DataRow
              label="Max V/C"
              value={fmt(stage4.max_scenario_vc, 2)}
            />
            <DataRow
              label="Avg V/C"
              value={fmt(stage4.average_scenario_vc, 2)}
            />
            <DataRow
              label="Baseline V/C"
              value={fmt(stage4.baseline_average_vc, 2)}
            />
          </div>

          {/* Top Bottlenecks */}
          {stage4.top_bottlenecks && stage4.top_bottlenecks.length > 0 && (
            <div className="sim-card" style={{ marginTop: "8px" }}>
              <div className="sim-subtable">
              <span className="sim-subtable-label">Top Bottlenecks</span>
              <table>
                <thead>
                  <tr>
                    <th>Road</th>
                    <th>Type</th>
                    <th style={{ textAlign: "right" }}>Δ veh/h</th>
                    <th style={{ textAlign: "right" }}>V/C</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {stage4.top_bottlenecks.slice(0, 5).map((b, i) => (
                    <tr key={i}>
                      <td title={b.road_id || ""}>{b.road_id || "—"}</td>
                      <td>{b.road_type || "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        {fmt(b.delta_traffic_veh_h)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {fmt(b.scenario_vc, 2)}
                      </td>
                      <td>
                        <Badge
                          color={
                            IMPACT_COLORS[b.impact_severity] || "#64748b"
                          }
                        >
                          {b.impact_severity || "—"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Prototype Disclaimer */}
          {stage4.prototype_disclaimer && (
            <div className="sim-disclaimer">{stage4.prototype_disclaimer}</div>
          )}
        </Section>
      )}

      {/* ===========================================================
          ELECTRICITY
      =========================================================== */}

      {stage5 && (
        <Section title="ELECTRICITY">
          <div className="sim-card">
            {stage5.electricity_available === false ? (
              <div className="sim-unavailable">
                No electricity result available.
                {stage5.reason && (
                  <span className="sim-unavailable-reason">
                    {stage5.reason}
                  </span>
                )}
              </div>
            ) : (
              <>
                <DataRow
                  label="Consumption"
                  value={fmt(stage5.electricity_kwh)}
                  unit="kWh"
                />
                <DataRow
                  label="Building Type"
                  value={stage5.building_type || "—"}
                />
                <DataRow
                  label="Floor Area"
                  value={fmt(stage5.floor_area_sqm || stage5.total_floor_area_sqm)}
                  unit="m²"
                />
                {stage5.city && (
                  <DataRow label="City" value={stage5.city} />
                )}
                {stage5.calibration && (
                  <DataRow label="Calibration" value={stage5.calibration} />
                )}
                {stage5.uncertainty && (
                  <>
                    <div className="sim-divider" />
                    <DataRow
                      label="Range"
                      value={`${fmt(stage5.uncertainty.low)} – ${fmt(stage5.uncertainty.high)} kWh`}
                    />
                  </>
                )}
                {stage5.components && stage5.components.length > 0 && (
                  <div className="sim-subtable">
                    <span className="sim-subtable-label">Components</span>
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th style={{ textAlign: "right" }}>Area (m²)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stage5.components.map((c, i) => (
                          <tr key={i}>
                            <td>{c.building_type || "—"}</td>
                            <td style={{ textAlign: "right" }}>
                              {fmt(c.gross_floor_area_sqm)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </Section>
      )}

      {/* ===========================================================
          TECHNICAL DETAILS (collapsible)
      =========================================================== */}

      <Section title="TECHNICAL DETAILS">
        <button
          className="sim-tech-toggle"
          onClick={() => setShowTech((v) => !v)}
        >
          {showTech ? "Hide" : "Show"} Full Response
        </button>
        {showTech && (
          <pre className="sim-tech-json">
            {JSON.stringify(simulationResult, null, 2)}
          </pre>
        )}
      </Section>
    </div>
  );
}
