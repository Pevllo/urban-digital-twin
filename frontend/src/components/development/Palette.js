import { SUPPORTED_DEV_TYPES } from '../../types/development.js';

export function renderPaletteCards(containerEl, onCardDragStart) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  Object.entries(SUPPORTED_DEV_TYPES).forEach(([typeKey, spec]) => {
    const card = document.createElement('div');
    card.className = 'draggable-dev-card';
    card.setAttribute('data-type', typeKey);

    card.innerHTML = `
      <div class="dev-card-icon">${spec.icon}</div>
      <div class="dev-card-info">
        <div class="dev-card-title">${spec.label}</div>
        <div class="dev-card-sub">Drag or click to place on map</div>
      </div>
    `;

    const triggerStart = (e) => {
      if (onCardDragStart) onCardDragStart(typeKey, spec, e);
    };

    card.addEventListener('pointerdown', triggerStart);
    card.addEventListener('click', triggerStart);

    containerEl.appendChild(card);
  });
}
