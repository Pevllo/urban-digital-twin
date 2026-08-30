import { SUPPORTED_DEV_TYPES } from '../../types/development.js';
import { scenarioState } from '../../state/scenarioState.js';

export function renderDevelopmentList(containerEl, devStore, options = {}) {
  if (!containerEl || !devStore) return;
  const { onSelect, onEdit, onMove, onDelete, devCountEl, btnRunSimEl } = options;

  const allDevs = devStore.getAllDevelopments();
  const selectedDevId = scenarioState.getState().selectedDevIdForSim;

  if (devCountEl) devCountEl.textContent = allDevs.length;

  if (allDevs.length === 0) {
    containerEl.innerHTML = '<p class="empty-list-msg">No developments placed yet. Click "+ Add Development" to place land-use on the map.</p>';
    if (btnRunSimEl) {
      btnRunSimEl.disabled = true;
    }
    return;
  }

  containerEl.innerHTML = '';

  allDevs.forEach((dev) => {
    const dId = dev.id || dev.development_id;
    const config = SUPPORTED_DEV_TYPES[dev.development_type] || SUPPORTED_DEV_TYPES.residential_compound;
    const isSelected = dId === selectedDevId;

    const props = dev.properties || {};
    const gfa = props.gross_floor_area_sqm || props.gross_leasable_area_sqm || dev.area || (dev.footprint ? dev.footprint.width * dev.footprint.length : 0);
    const floors = dev.floors || (dev.buildingHeight ? Math.round(dev.buildingHeight / 3) : 1);
    const zoneStr = dev.zone_id ? `Zone: ${dev.zone_id}` : 'Zone: Unresolved';

    const item = document.createElement('div');
    item.className = `compact-dev-card ${isSelected ? 'selected' : ''}`;

    item.innerHTML = `
      <div class="dev-card-main-row">
        <span class="dev-type-icon">${config.icon}</span>
        <div class="dev-card-text">
          <div class="dev-card-name">${dev.name || dId}</div>
          <div class="dev-card-type-label">${config.label}</div>
          <div class="dev-card-metrics">${Number(gfa).toLocaleString()} m² | ${floors} Floors</div>
          <div class="dev-card-zone">${zoneStr}</div>
        </div>
        <div class="compact-dev-actions">
          <button class="btn-mini-action edit" title="Edit Properties">✏️</button>
          <button class="btn-mini-action move" title="Move Location">📍</button>
          <button class="btn-mini-action delete" title="Delete">🗑️</button>
        </div>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (onSelect) onSelect(dev);
    });

    const btnEdit = item.querySelector('.edit');
    const btnMove = item.querySelector('.move');
    const btnDelete = item.querySelector('.delete');

    if (btnEdit) btnEdit.addEventListener('click', (e) => { e.stopPropagation(); onEdit && onEdit(dev); });
    if (btnMove) btnMove.addEventListener('click', (e) => { e.stopPropagation(); onMove && onMove(dev); });
    if (btnDelete) btnDelete.addEventListener('click', (e) => { e.stopPropagation(); onDelete && onDelete(dev); });

    containerEl.appendChild(item);
  });
}
