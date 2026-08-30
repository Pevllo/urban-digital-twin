import { scenarioState } from '../../state/scenarioState.js';

let activeResultTab = 'ELECTRICITY';

export function renderSimulationResults(containerEl, result, devStore = null) {
  if (!containerEl) return;

  if (!result) {
    containerEl.innerHTML = `
      <div class="empty-sim-results">
        <div class="empty-sim-icon">⚡</div>
        <div class="empty-sim-title">No Active Simulation Result</div>
        <p class="empty-sim-sub">Select a development from the panel and click <strong>RUN WHAT-IF SIMULATION</strong>.</p>
      </div>
    `;
    return;
  }

  if (result.error) {
    containerEl.innerHTML = `
      <div class="sim-error-card">
        <strong>Simulation Failed</strong>
        <p>${result.error}</p>
      </div>
    `;
    return;
  }

  const devInput = result.development_input || {};
  const stage1 = result.stage1_od_demand || {};
  const stage3 = result.stage3_scenario_traffic || {};
  const stage4 = result.stage4_impact_assessment || {};
  const stage5 = result.stage5_electricity || {};
  const meta = result.execution_metadata || {};

  const devId = devInput.development_id || 'DEV-001';
  const devName = devInput.name || (devInput.development_type ? devInput.development_type.toUpperCase().replace(/_/g, ' ') : 'DEVELOPMENT');
  const devTypeLabel = (devInput.development_type || 'building').replace(/_/g, ' ');

  const genTrips = Math.round(stage1.total_trips || 0);
  const assignTrips = Math.round(stage3.assigned_external_trips || 0);
  const assignRate = genTrips > 0 ? Math.min(100, Math.round((assignTrips / genTrips) * 100)) : 100;
  const networkRoads = stage4.number_of_affected_roads || 962;
  const worsenedRoads = stage4.roads_worsened_count || 0;
  const overCapRoads = stage4.roads_reaching_vc_1_or_more_count || 0;
  const maxVc = typeof stage4.max_scenario_vc === 'number' ? stage4.max_scenario_vc.toFixed(2) : '0.00';

  // Electricity data contract
  const elecAvailable = Boolean(stage5 && stage5.electricity_available !== false && typeof stage5.electricity_kwh === 'number');
  const elecKwh = stage5 ? (stage5.electricity_kwh || 0) : 0;
  const elecCity = (stage5 && stage5.city) || 'Cairo';
  const elecCalibration = (stage5 && stage5.calibration) || 'CAL-3';
  const annualKwh = stage5 && typeof stage5.annual_kwh === 'number' ? stage5.annual_kwh : Math.round(elecKwh * 8760);
  const peakKwh = stage5 && typeof stage5.peak_kwh === 'number' ? stage5.peak_kwh : Number((elecKwh * 1.15).toFixed(1));
  const floorArea = (stage5 && (stage5.floor_area_sqm || stage5.total_floor_area_sqm)) || devInput.properties?.gross_floor_area_sqm || 3500;
  const eui = floorArea > 0 ? (annualKwh / floorArea).toFixed(1) : '160.3';

  // Format Annual Consumption (GWh or MWh or kWh)
  let annualStr = `${(annualKwh / 1000000).toFixed(2)} GWh/year`;
  if (annualKwh < 1000000) {
    annualStr = `${(annualKwh / 1000).toFixed(1)} MWh/year`;
  }

  // What-If Impact comparison
  const state = scenarioState.getState();
  const prevResult = state.previousSimulationResult;
  const prevStage5 = prevResult ? prevResult.stage5_electricity : null;
  const prevKwh = prevStage5 && typeof prevStage5.electricity_kwh === 'number' ? prevStage5.electricity_kwh : null;
  const prevAnnual = prevStage5 && typeof prevStage5.annual_kwh === 'number' ? prevStage5.annual_kwh : (prevKwh ? prevKwh * 8760 : null);

  let kwhDiffStr = '';
  let kwhPercentStr = '';
  let annualDiffStr = '';
  let annualPercentStr = '';
  let isPositiveDiff = true;

  if (prevKwh !== null && prevKwh > 0) {
    const kwhDiff = elecKwh - prevKwh;
    const kwhPercent = (kwhDiff / prevKwh) * 100;
    isPositiveDiff = kwhDiff >= 0;
    kwhDiffStr = `${isPositiveDiff ? '+' : ''}${kwhDiff.toFixed(1)} kWh`;
    kwhPercentStr = `(${isPositiveDiff ? '+' : ''}${kwhPercent.toFixed(1)}%)`;

    if (prevAnnual !== null && prevAnnual > 0) {
      const annualDiff = annualKwh - prevAnnual;
      const annualDiffMwh = (annualDiff / 1000).toFixed(1);
      const annualPercent = (annualDiff / prevAnnual) * 100;
      annualDiffStr = `${isPositiveDiff ? '+' : ''}${annualDiffMwh} MWh`;
      annualPercentStr = `(${isPositiveDiff ? '+' : ''}${annualPercent.toFixed(1)}%)`;
    }
  }

  // Get developments for Demand By Development list
  const allDevs = devStore ? devStore.getAllDevelopments() : [];
  const resultsByDevId = state.resultsByDevId || {};

  // Build HTML structure
  containerEl.innerHTML = `
    <div class="sim-results-wrapper">
      <!-- Top Results Header -->
      <div class="sim-results-header">
        <div class="sim-results-title-group">
          <span class="sim-results-main-title">SIMULATION RESULTS</span>
          <span class="sim-status-chip">✓ Completed Successfully</span>
        </div>
        <span class="sim-timestamp">Today, 14:00</span>
      </div>

      <!-- Result Sub-Tabs -->
      <div class="sim-sub-tabs">
        <button class="sim-sub-tab ${activeResultTab === 'OVERVIEW' ? 'active' : ''}" data-tab="OVERVIEW">OVERVIEW</button>
        <button class="sim-sub-tab ${activeResultTab === 'TRAFFIC' ? 'active' : ''}" data-tab="TRAFFIC">TRAFFIC</button>
        <button class="sim-sub-tab ${activeResultTab === 'ELECTRICITY' ? 'active' : ''}" data-tab="ELECTRICITY">⚡ ELECTRICITY</button>
        <button class="sim-sub-tab ${activeResultTab === 'ENVIRONMENT' ? 'active' : ''}" data-tab="ENVIRONMENT">ENVIRONMENT</button>
      </div>

      <!-- Tab Content Area -->
      <div class="sim-tab-content">
        ${activeResultTab === 'ELECTRICITY' ? `
          <!-- ELECTRICITY TAB -->
          <div class="elec-card-container">
            <div class="elec-card-header">
              <div class="elec-card-title">⚡ ELECTRICITY DEMAND</div>
              <span class="elec-calibration-tag">Egypt Calibration • ${elecCalibration}</span>
            </div>

            ${elecAvailable ? `
              <!-- 4-Grid Key Metrics -->
              <div class="elec-metrics-grid">
                <div class="elec-metric-box highlight">
                  <span class="metric-label">TOTAL CURRENT DEMAND</span>
                  <strong class="metric-val">${elecKwh.toFixed(1)} <span class="metric-unit">kWh</span></strong>
                </div>

                <div class="elec-metric-box">
                  <span class="metric-label">ANNUAL CONSUMPTION</span>
                  <strong class="metric-val">${annualStr}</strong>
                </div>

                <div class="elec-metric-box">
                  <span class="metric-label">PEAK DEMAND</span>
                  <strong class="metric-val">${peakKwh.toFixed(1)} <span class="metric-unit">kWh</span></strong>
                </div>

                <div class="elec-metric-box">
                  <span class="metric-label">EUI (WEIGHTED AVG.)</span>
                  <strong class="metric-val">${eui} <span class="metric-unit">kWh/m²/year</span></strong>
                </div>
              </div>

              <!-- DEMAND BY DEVELOPMENT SECTION -->
              <div class="demand-by-dev-section">
                <div class="section-title">DEMAND BY DEVELOPMENT</div>
                <div class="dev-demand-list">
                  ${allDevs.length > 0 ? allDevs.map(d => {
                    const dId = d.id || d.development_id;
                    const dRes = resultsByDevId[dId] || (dId === devId ? result : null);
                    const dElec = dRes ? dRes.stage5_electricity : null;
                    const dKwh = dElec && typeof dElec.electricity_kwh === 'number' ? dElec.electricity_kwh : (elecKwh > 0 && dId === devId ? elecKwh : 0);
                    const dAnnual = dElec && typeof dElec.annual_kwh === 'number' ? dElec.annual_kwh : Math.round(dKwh * 8760);
                    const dGfa = d.properties?.gross_floor_area_sqm || d.properties?.gross_leasable_area_sqm || d.area || 3500;
                    const maxDevKwh = Math.max(1, elecKwh, ...Object.values(resultsByDevId).map(r => r.stage5_electricity?.electricity_kwh || 0));
                    const barPercent = Math.min(100, Math.max(8, (dKwh / maxDevKwh) * 100));

                    return `
                      <div class="dev-demand-row">
                        <div class="dev-demand-info">
                          <div class="dev-demand-name">${d.name || dId}</div>
                          <div class="dev-demand-sub">${d.development_type.toUpperCase()} • ${Number(dGfa).toLocaleString()} m²</div>
                        </div>
                        <div class="dev-demand-values">
                          <div class="dev-kwh-val">${dKwh > 0 ? `${dKwh.toFixed(1)} kWh` : 'Pending'}</div>
                          <div class="dev-annual-val">${dAnnual > 0 ? `${dAnnual.toLocaleString()} kWh/year` : ''}</div>
                        </div>
                        <div class="dev-demand-bar-bg">
                          <div class="dev-demand-bar-fill" style="width: ${barPercent}%;"></div>
                        </div>
                      </div>
                    `;
                  }).join('') : `
                    <div class="dev-demand-row">
                      <div class="dev-demand-info">
                        <div class="dev-demand-name">${devName}</div>
                        <div class="dev-demand-sub">${devTypeLabel.toUpperCase()} • ${Number(floorArea).toLocaleString()} m²</div>
                      </div>
                      <div class="dev-demand-values">
                        <div class="dev-kwh-val">${elecKwh.toFixed(1)} kWh</div>
                        <div class="dev-annual-val">${annualKwh.toLocaleString()} kWh/year</div>
                      </div>
                      <div class="dev-demand-bar-bg">
                        <div class="dev-demand-bar-fill" style="width: 100%;"></div>
                      </div>
                    </div>
                  `}
                </div>
              </div>

              <!-- WHAT-IF IMPACT SECTION -->
              <div class="what-if-impact-section">
                <div class="impact-header-row">
                  <span class="section-title">WHAT-IF IMPACT <span class="sub-label">(vs. previous run)</span></span>
                </div>

                ${kwhDiffStr ? `
                  <div class="impact-comparison-box">
                    <div class="impact-icon-circle ${isPositiveDiff ? 'increase' : 'decrease'}">
                      <span>${isPositiveDiff ? '↗' : '↘'}</span>
                    </div>
                    <div class="impact-metrics-details">
                      <div class="impact-label">Total Current Demand</div>
                      <div class="impact-val ${isPositiveDiff ? 'increase' : 'decrease'}">${kwhDiffStr} ${kwhPercentStr}</div>
                      <div class="impact-sub">Annual Consumption: ${annualDiffStr} ${annualPercentStr}</div>
                    </div>
                  </div>
                ` : `
                  <div class="no-prev-comparison">
                    <span class="info-icon">ℹ</span> No previous scenario to compare
                  </div>
                `}
              </div>
            ` : `
              <div class="elec-unavailable-box">
                ⚡ Electricity Data: ${stage5.reason || 'Unavailable for this development.'}
              </div>
            `}
          </div>
        ` : activeResultTab === 'TRAFFIC' ? `
          <!-- TRAFFIC TAB -->
          <div class="traffic-metrics-container">
            <div class="traffic-grid">
              <div class="traffic-metric-card">
                <span class="t-label">GENERATED TRIPS</span>
                <strong class="t-val cyan">${genTrips} <span class="t-unit">veh/h</span></strong>
              </div>
              <div class="traffic-metric-card">
                <span class="t-label">ASSIGNED TRIPS</span>
                <strong class="t-val purple">${assignTrips} <span class="t-unit">veh/h</span></strong>
              </div>
              <div class="traffic-metric-card">
                <span class="t-label">ASSIGNMENT RATE</span>
                <strong class="t-val green">${assignRate}%</strong>
              </div>
              <div class="traffic-metric-card">
                <span class="t-label">MAX V/C RATIO</span>
                <strong class="t-val yellow">${maxVc}</strong>
              </div>
            </div>
            <div class="traffic-summary-list">
              <div>Network Roads: <strong>${networkRoads}</strong></div>
              <div>Worsened Roads: <strong class="warn">${worsenedRoads}</strong></div>
              <div>Over Capacity (V/C &ge; 1.0): <strong class="danger">${overCapRoads}</strong></div>
            </div>
          </div>
        ` : activeResultTab === 'OVERVIEW' ? `
          <!-- OVERVIEW TAB -->
          <div class="overview-container">
            <div class="overview-item"><span>Development:</span> <strong>${devName} (${devId})</strong></div>
            <div class="overview-item"><span>Type:</span> <strong>${devTypeLabel}</strong></div>
            <div class="overview-item"><span>Location:</span> <strong>${devInput.zone_id || 'R3 Zone'}</strong></div>
            <div class="overview-item"><span>Hour:</span> <strong>${result.hour || 8}:00</strong></div>
            <div class="overview-item"><span>Generated Trips:</span> <strong>${genTrips} veh/hr</strong></div>
            <div class="overview-item"><span>Electricity Demand:</span> <strong>${elecKwh.toFixed(1)} kWh</strong></div>
            <div class="overview-item"><span>Execution Time:</span> <strong>${meta.execution_time_seconds || 0.1} s</strong></div>
          </div>
        ` : `
          <!-- ENVIRONMENT TAB -->
          <div class="overview-container">
            <div class="overview-item"><span>Estimated CO2 Emissions:</span> <strong>${(elecKwh * 0.42).toFixed(1)} kg/hr</strong></div>
            <div class="overview-item"><span>Annual Carbon Footprint:</span> <strong>${(annualKwh * 0.42 / 1000).toFixed(2)} metric tons/year</strong></div>
            <div class="overview-item"><span>Grid Source:</span> <strong>Greater Cairo Power Grid</strong></div>
          </div>
        `}
      </div>

      <!-- Export Action Footer -->
      <div class="sim-results-footer">
        <button class="btn-export-results" onclick="alert('Simulation report ready for download.')">
          <span>📥</span> Export Results
        </button>
      </div>
    </div>
  `;

  // Attach Sub-Tab Click Handler
  const tabButtons = containerEl.querySelectorAll('.sim-sub-tab');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeResultTab = btn.getAttribute('data-tab');
      renderSimulationResults(containerEl, result, devStore);
    });
  });
}

