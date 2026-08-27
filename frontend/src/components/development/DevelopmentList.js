import { SUPPORTED_DEV_TYPES } from '../../types/development.js';

export function renderDevelopmentList(containerEl, devStore, options = {}) {
  if (!containerEl || !devStore) return;
  const { onSelect, onEdit, onMove, onDelete, devCountEl, btnRunSimEl } = options;

  const allDevs = devStore.getAllDevelopments();
  if (devCountEl) devCountEl.textContent = allDevs.length;

  if (allDevs.length === 0) {
    containerEl.innerHTML = '<p class="empty-list-msg">No developments placed yet. Drag a land-use card onto the 3D city.</p>';
    if (btnRunSimEl) {
      btnRunSimEl.disabled = true;
      btnRunSimEl.innerHTML = '<span>⚡</span> Run What-If Simulation';
    }
    return;
  }

  containerEl.innerHTML = '';

  allDevs.forEach((dev) => {
    const config = SUPPORTED_DEV_TYPES[dev.development_type] || SUPPORTED_DEV_TYPES.residential_compound;

    const item = document.createElement('div');
    item.className = 'compact-dev-item';

    const propSummary = Object.entries(dev.properties || {})
      .map(([k, v]) => `${k.replace(/num_|gross_|staff_/g, '')}: ${v}`)
      .join(', ');

    item.innerHTML = `
      <div class="compact-dev-top">
        <div class="compact-dev-title">${config.icon} ${dev.name}</div>
        <div class="compact-dev-actions">
          <button class="btn-mini-action edit" title="Edit Properties">✏️</button>
          <button class="btn-mini-action move" title="Move Location">📍</button>
          <button class="btn-mini-action delete" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="compact-dev-sub">${dev.id || dev.development_id} | Zone ${dev.zone_id} | ${propSummary}</div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (onSelect) onSelect(dev);
    });

    const btnEdit = item.querySelector('.edit');
    const btnMove = item.querySelector('.move');
    const btnDelete = item.querySelector('.delete');

    if (btnEdit) btnEdit.addEventListener('click', () => onEdit && onEdit(dev));
    if (btnMove) btnMove.addEventListener('click', () => onMove && onMove(dev));
    if (btnDelete) btnDelete.addEventListener('click', () => onDelete && onDelete(dev));

    containerEl.appendChild(item);
  });
}
