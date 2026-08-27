export function renderSimulationResults(containerEl, result) {
  if (!containerEl || !result) return;

  const devInput = result.development_input || {};
  const stage1 = result.stage1_od_demand || {};
  const stage3 = result.stage3_scenario_traffic || {};
  const stage4 = result.stage4_impact_assessment || {};
  const meta = result.execution_metadata || {};

  const impactLevel = (stage4.overall_impact_level || 'LOW').toUpperCase();

  containerEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; font-size:11px;">
      <div style="font-weight:700; color:#38bdf8;">${devInput.name || devInput.development_id}</div>
      <div>Zone ${devInput.zone_id} | Hour ${String(result.hour || 8).padStart(2, '0')}:00</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:4px;">
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">GENERATED TRIPS</span><br>
          <strong style="color:#38bdf8;">${Math.round(stage1.total_trips || 0)} veh/h</strong>
        </div>
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">ASSIGNED TRIPS</span><br>
          <strong style="color:#818cf8;">${Math.round(stage3.assigned_external_trips || 0)} veh/h</strong>
        </div>
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">AFFECTED ROADS</span><br>
          <strong>${stage4.number_of_affected_roads || 0}</strong>
        </div>
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">MAX V/C RATIO</span><br>
          <strong style="color:#c084fc;">${(stage4.max_scenario_vc || 0).toFixed(2)}</strong>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; border-top:1px solid rgba(255,255,255,0.1); padding-top:6px;">
        <span>IMPACT LEVEL:</span>
        <span class="impact-badge impact-${impactLevel.toLowerCase()}">${impactLevel}</span>
      </div>
      <div style="font-size:9px; color:#64748b; text-align:right;">Completed in ${meta.execution_time_seconds || 0} s</div>
    </div>
  `;
}
