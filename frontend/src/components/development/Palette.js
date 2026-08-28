import { SUPPORTED_DEV_TYPES } from '../../types/development.js';

/**
 * Render Palette Cards — AI Urban Digital Twin
 * Registers single pointerdown handler to avoid dual-firing conflicts with click events.
 */
export function renderPaletteCards(containerEl, options = {}) {
  const { onCardPointerDown, onCardClick } = typeof options === 'function'
    ? { onCardClick: options, onCardPointerDown: options }
    : options;

  if (!containerEl) return;
  containerEl.innerHTML = '';

  Object.entries(SUPPORTED_DEV_TYPES).forEach(([typeKey, spec]) => {
    const card = document.createElement('div');
    card.className = 'draggable-dev-card';
    card.setAttribute('data-type', typeKey);
    card.style.touchAction = 'none';

    card.innerHTML = `
      <div class="dev-card-icon">${spec.icon}</div>
      <div class="dev-card-info">
        <div class="dev-card-title">${spec.label}</div>
        <div class="dev-card-sub">Drag or click to place on map</div>
      </div>
    `;

    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (onCardPointerDown) {
        onCardPointerDown(typeKey, spec, e);
      }
    });

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (onCardClick) {
        onCardClick(typeKey, spec, e);
      }
    });

    containerEl.appendChild(card);
  });
}
