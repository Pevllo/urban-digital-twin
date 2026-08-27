export class ScenarioState {
  constructor() {
    this.state = {
      selectedCity: 'NAC_R3',
      activePlacementType: null,
      movingDevId: null,
      editingDevId: null,
      selectedDevIdForSim: null,
      isSimulationRunning: false,
      lastSimulationResult: null,
      buildabilityState: { valid: true, reason: '' },
    };
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[scenarioState notification error]:', err);
      }
    }
  }

  setPlacementType(type) {
    this.state.activePlacementType = type;
    this.notify();
  }

  setMovingDevId(id) {
    this.state.movingDevId = id;
    this.notify();
  }

  setSelectedDevForSim(id) {
    this.state.selectedDevIdForSim = id;
    this.notify();
  }

  setSimulationRunning(running) {
    this.state.isSimulationRunning = running;
    this.notify();
  }

  setSimulationResult(result) {
    this.state.lastSimulationResult = result;
    this.notify();
  }

  getState() {
    return { ...this.state };
  }
}

export const scenarioState = new ScenarioState();
