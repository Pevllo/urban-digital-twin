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
      previousSimulationResult: null,
      resultsByDevId: {},
      buildabilityState: { valid: true, reason: '' },
      activeMapLayers: {
        buildings: true,
        traffic: true,
        devAreas: true,
        electricity: true,
      },
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
    if (result && !result.error) {
      if (this.state.lastSimulationResult) {
        this.state.previousSimulationResult = this.state.lastSimulationResult;
      }
      this.state.lastSimulationResult = result;
      const devId = result.development_input?.development_id || this.state.selectedDevIdForSim;
      if (devId) {
        this.state.resultsByDevId = {
          ...this.state.resultsByDevId,
          [devId]: result,
        };
      }
    } else {
      this.state.lastSimulationResult = result;
    }
    this.notify();
  }

  setMapLayerActive(layerKey, isActive) {
    this.state.activeMapLayers = {
      ...this.state.activeMapLayers,
      [layerKey]: isActive,
    };
    this.notify();
  }

  getState() {
    return { ...this.state };
  }
}

export const scenarioState = new ScenarioState();
