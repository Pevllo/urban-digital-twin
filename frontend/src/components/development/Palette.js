import { SUPPORTED_DEV_TYPES } from '../../types/development.js';

/**
 * Render Palette Cards — AI Urban Digital Twin
 * Registers single pointerdown handler to avoid dual-firing conflicts with click events.
 */
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

    // Single pointerdown listener to initiate placement mode cleanly
    card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (onCardDragStart) {
        onCardDragStart(typeKey, spec, e);
      }
    });

    // Prevent secondary click event from restarting placement mode
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });

    containerEl.appendChild(card);
  });
}
