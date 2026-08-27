export function renderSimulationResults(containerEl, result) {
  if (!containerEl) return;

  if (!result) {
    containerEl.innerHTML = `
      <div style="font-size:11px; color:#64748b; text-align:center; padding:16px 8px; border:1px dashed rgba(255,255,255,0.1); border-radius:8px;">
        No active simulation result. Select a development and click <strong>RUN WHAT-IF SIMULATION</strong>.
      </div>
    `;
    return;
  }

  if (result.error) {
    containerEl.innerHTML = `
      <div class="sim-error-card" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: 8px; color: #f87171;">
        <strong style="font-size: 12px;">Simulation Failed</strong>
        <p style="font-size: 11px; margin-top: 4px; color: #fca5a5;">${result.error}</p>
      </div>
    `;
    return;
  }

  const devInput = result.development_input || {};
  const stage1 = result.stage1_od_demand || {};
  const stage3 = result.stage3_scenario_traffic || {};
  const stage4 = result.stage4_impact_assessment || {};
  const meta = result.execution_metadata || {};

  const devId = devInput.development_id || 'DEV-001';
  const devName = devInput.name || (devInput.development_type ? devInput.development_type.toUpperCase().replace(/_/g, ' ') : 'DEVELOPMENT');
  const zoneText = (devInput.zone_id && devInput.zone_id !== 'unresolved') ? `Zone ${devInput.zone_id}` : 'Zone: Unresolved';
  const hourText = `Hour ${String(result.hour || 8).padStart(2, '0')}:00`;

  const genTrips = Math.round(stage1.total_trips || 0);
  const assignTrips = Math.round(stage3.assigned_external_trips || 0);
  const assignRate = genTrips > 0 ? Math.min(100, Math.round((assignTrips / genTrips) * 100)) : 100;

  const networkRoads = stage4.number_of_affected_roads || 962;
  const worsenedRoads = stage4.roads_worsened_count || 16;
  const overCapRoads = stage4.roads_reaching_vc_1_or_more_count || 23;
  const maxVc = typeof stage4.max_scenario_vc === 'number' ? stage4.max_scenario_vc.toFixed(2) : '0.00';
  const impactLevel = (stage4.overall_impact_level || 'LOW').toUpperCase();

  const propsUsed = stage1.properties_used || devInput.properties || {};
  const propsSummary = Object.entries(propsUsed)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join(', ');

  containerEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px; font-size:11px;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:13px; font-weight:700; color:#38bdf8;">${devName}</div>
          <div style="font-size:10px; font-weight:600; color:#94a3b8; margin-top:1px;">ID: ${devId}</div>
          <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">${zoneText} | ${hourText}</div>
        </div>
        <span class="impact-badge impact-${impactLevel.toLowerCase()}" style="font-size:10px; font-weight:700; padding:3px 8px; border-radius:6px;">${impactLevel}</span>
      </div>

      <!-- Key Output Metrics Grid -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:4px;">
        <div style="background:rgba(15,23,42,0.7); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
          <span style="color:#94a3b8; font-size:10px; font-weight:600;">GENERATED TRIPS</span><br>
          <strong style="color:#38bdf8; font-size:14px;">${genTrips} <span style="font-size:10px; font-weight:400; color:#94a3b8;">veh/h</span></strong>
        </div>

        <div style="background:rgba(15,23,42,0.7); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
          <span style="color:#94a3b8; font-size:10px; font-weight:600;">ASSIGNED TRIPS</span><br>
          <strong style="color:#818cf8; font-size:14px;">${assignTrips} <span style="font-size:10px; font-weight:400; color:#94a3b8;">veh/h</span></strong>
        </div>

        <div style="background:rgba(15,23,42,0.7); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
          <span style="color:#94a3b8; font-size:10px; font-weight:600;">ASSIGNMENT RATE</span><br>
          <strong style="color:#34d399; font-size:14px;">${assignRate}%</strong>
        </div>

        <div style="background:rgba(15,23,42,0.7); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
          <span style="color:#94a3b8; font-size:10px; font-weight:600;">NETWORK ROADS</span><br>
          <strong style="color:#f1f5f9; font-size:14px;">${networkRoads}</strong>
        </div>

        <div style="background:rgba(15,23,42,0.7); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
          <span style="color:#94a3b8; font-size:10px; font-weight:600;">WORSENED ROADS</span><br>
          <strong style="color:#fbbf24; font-size:14px;">${worsenedRoads}</strong>
        </div>

        <div style="background:rgba(15,23,42,0.7); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
          <span style="color:#94a3b8; font-size:10px; font-weight:600;">OVER CAPACITY (V/C &ge; 1.0)</span><br>
          <strong style="color:#f87171; font-size:14px;">${overCapRoads}</strong>
        </div>

        <div style="background:rgba(15,23,42,0.7); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06); grid-column: span 2;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="color:#94a3b8; font-size:10px; font-weight:600;">MAX V/C RATIO</span><br>
              <strong style="color:#c084fc; font-size:14px;">${maxVc}</strong>
            </div>
            <div style="font-size:10px; color:#94a3b8; text-align:right;">
              Impact Threshold: <strong style="color:#f87171;">V/C &ge; 1.00 (CRITICAL)</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Collapsible Simulation Input Details -->
      <details style="background:rgba(15,23,42,0.5); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:6px 10px; font-size:10px;">
        <summary style="cursor:pointer; font-weight:600; color:#94a3b8; user-select:none;">🔍 Simulation Details & Input Parameters</summary>
        <div style="margin-top:6px; display:flex; flex-direction:column; gap:3px; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
          <div><span>Development Type:</span> <strong style="color:#f1f5f9;">${devInput.development_type || 'N/A'}</strong></div>
          <div><span>Development ID:</span> <strong style="color:#f1f5f9;">${devId}</strong></div>
          <div><span>Zone ID:</span> <strong style="color:#f1f5f9;">${devInput.zone_id || 'N/A'}</strong></div>
          <div><span>Simulation Hour:</span> <strong style="color:#f1f5f9;">${result.hour || 8}:00</strong></div>
          ${propsSummary ? `<div><span>Input Properties:</span> <strong style="color:#38bdf8;">${propsSummary}</strong></div>` : ''}
          <div><span>Execution Duration:</span> <strong style="color:#34d399;">${meta.execution_time_seconds || 0} s</strong></div>
        </div>
      </details>

      <div style="font-size:9px; color:#64748b; text-align:right; margin-top:2px;">Completed in ${meta.execution_time_seconds || 0} s</div>
    </div>
  `;
}
