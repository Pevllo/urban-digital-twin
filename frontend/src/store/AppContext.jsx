import { createContext, useContext, useReducer } from "react";
import {
  loadStoredReports,
  createReportRecord,
  addReportToCollection,
  removeReportsForDevelopment,
} from "../services/reportService.js";

const AppContext = createContext(null);

const initialState = {
  // Backend connection
  backend: {
    checking: true,
    healthy: false,
    error: null,
    lastCheckedAt: null,
  },

  // City / map metadata from backend
  city: {
    loaded: false,
    info: null,
    mapConfig: null,
  },

  // Map state
  map: {
    viewerReady: false,
    basemap: "satellite", // "satellite" | "google-roadmap"
    layerVisibility: {
      roads: true,
      buildings: true,
      developments: true,
      projectBoundary: true,
      osmBoundaries: true,
    },
    selectedLocation: null, // { latitude, longitude, name }
    selectedRoad: null, // { id, osm_way_id, name, highway, baseline, scenario }
  },

  // Traffic state
  traffic: {
    loading: false,
    baseline: null,
    scenario: null, // road_assessments from What-If simulation
    error: null,
  },

  // Existing developments from backend
  developments: {
    loading: false,
    error: null,
    items: [],
    reloadToken: 0,
    selected: null,
    deletingId: null,
    deleteError: null,
  },

  // Proposed development configuration
  development: {
    type: "residential_compound",
    name: "",
    floors: 5,
    properties: {},
    status: "proposed",
    placed: null, // the returned backend development record
    placing: false,
    error: null,
  },

  // Simulation state
  simulation: {
    running: false,
    startedAt: null,
    error: null,
    result: null,
  },

  // Persisted What-If simulation reports
  reports: loadStoredReports(),

  ui: {
    activeTab: "scenarios", // "digital-twin" | "scenarios" | "infrastructure" | "data-layers"
    fullReportOpen: false,
    selectedReport: null, // specific historical report record to inspect in FullReportView
    buildingReportsOpen: false, // report history subview for selected building
    editingDevelopmentId: null, // development_id currently being edited
    panelOpen: {
      development: true,
      simulation: true,
      results: true,
    },
  },
};

function reducer(state, action) {
  switch (action.type) {
    case "BACKEND_CHECKING":
      return { ...state, backend: { ...state.backend, checking: true, error: null } };
    case "BACKEND_HEALTHY":
      return {
        ...state,
        backend: {
          checking: false,
          healthy: true,
          error: null,
          lastCheckedAt: Date.now(),
        },
      };
    case "BACKEND_OFFLINE":
      return {
        ...state,
        backend: {
          checking: false,
          healthy: false,
          error: action.error,
          lastCheckedAt: Date.now(),
        },
      };
    case "CITY_LOADED":
      return {
        ...state,
        city: { loaded: true, info: action.info, mapConfig: action.mapConfig },
      };
    case "CITY_ERROR":
      return { ...state, city: { ...state.city, error: action.error } };
    case "MAP_VIEWER_READY":
      return { ...state, map: { ...state.map, viewerReady: true } };
    case "MAP_VIEWER_ERROR":
      return { ...state, map: { ...state.map, error: action.error } };
    case "SET_BASEMAP":
      return { ...state, map: { ...state.map, basemap: action.basemap } };
    case "TOGGLE_LAYER":
      return {
        ...state,
        map: {
          ...state.map,
          layerVisibility: {
            ...state.map.layerVisibility,
            [action.layer]: !state.map.layerVisibility[action.layer],
          },
        },
      };
    case "MAP_LOCATION_SELECTED":
      return {
        ...state,
        map: { ...state.map, selectedLocation: action.location, selectedRoad: null },
      };
    case "MAP_LOCATION_CLEARED":
      return { ...state, map: { ...state.map, selectedLocation: null } };
    case "MAP_ROAD_SELECTED":
      return {
        ...state,
        map: { ...state.map, selectedRoad: action.road },
      };
    case "MAP_ROAD_CLEARED":
      return { ...state, map: { ...state.map, selectedRoad: null } };
    case "TRAFFIC_BASELINE_LOADING":
      return { ...state, traffic: { ...state.traffic, loading: true, error: null } };
    case "TRAFFIC_BASELINE_LOADED":
      return { ...state, traffic: { ...state.traffic, loading: false, baseline: action.roads, error: null } };
    case "TRAFFIC_BASELINE_ERROR":
      return { ...state, traffic: { ...state.traffic, loading: false, error: action.error } };
    case "DEVELOPMENTS_LOADING":
      return { ...state, developments: { ...state.developments, loading: true, error: null } };
    case "DEVELOPMENTS_LOADED":
      return {
        ...state,
        developments: { ...state.developments, loading: false, items: action.items },
      };
    case "DEVELOPMENTS_ERROR":
      return {
        ...state,
        developments: { ...state.developments, loading: false, error: action.error },
      };
    case "DEVELOPMENTS_RELOAD":
      return {
        ...state,
        developments: {
          ...state.developments,
          reloadToken: state.developments.reloadToken + 1,
        },
      };
    case "DEVELOPMENT_SELECTED":
      return {
        ...state,
        developments: {
          ...state.developments,
          selected: action.dev,
          deleteError: null,
        },
        ui: {
          ...state.ui,
          buildingReportsOpen: false,
        },
      };
    case "DEVELOPMENT_DESELECTED":
      return {
        ...state,
        developments: {
          ...state.developments,
          selected: null,
          deleteError: null,
        },
        ui: {
          ...state.ui,
          buildingReportsOpen: false,
        },
      };
    case "DEVELOPMENT_DELETING":
      return {
        ...state,
        developments: {
          ...state.developments,
          deletingId: action.developmentId,
          deleteError: null,
        },
      };
    case "DEVELOPMENT_DELETED": {
      const remainingItems = state.developments.items.filter(
        (d) => (d.development_id || d.id) !== action.developmentId
      );
      const isSelected =
        state.developments.selected &&
        (state.developments.selected.development_id === action.developmentId ||
          state.developments.selected.id === action.developmentId);
      const isPlaced =
        state.development.placed &&
        (state.development.placed.development_id === action.developmentId ||
          state.development.placed.id === action.developmentId);

      const cleanedReports = removeReportsForDevelopment(state.reports, action.developmentId);
      const isSelectedReportDeleted =
        state.ui.selectedReport &&
        state.ui.selectedReport.developmentId === action.developmentId;

      return {
        ...state,
        reports: cleanedReports,
        developments: {
          ...state.developments,
          items: remainingItems,
          selected: isSelected ? null : state.developments.selected,
          deletingId: null,
          deleteError: null,
          reloadToken: state.developments.reloadToken + 1,
        },
        development: isPlaced
          ? { ...state.development, placed: null }
          : state.development,
        ui: {
          ...state.ui,
          selectedReport: isSelectedReportDeleted ? null : state.ui.selectedReport,
          buildingReportsOpen: isSelected ? false : state.ui.buildingReportsOpen,
        },
      };
    }
    case "DEVELOPMENT_DELETE_ERROR":
      return {
        ...state,
        developments: {
          ...state.developments,
          deletingId: null,
          deleteError: action.error,
        },
      };
    case "SET_DEVELOPMENT_TYPE":
      return {
        ...state,
        development: {
          ...state.development,
          type: action.devType,
          properties: {},
        },
      };
    case "SET_DEVELOPMENT_NAME":
      return { ...state, development: { ...state.development, name: action.name } };
    case "SET_DEVELOPMENT_FLOORS":
      return { ...state, development: { ...state.development, floors: action.floors } };
    case "SET_DEVELOPMENT_PROPERTY":
      return {
        ...state,
        development: {
          ...state.development,
          properties: { ...state.development.properties, [action.key]: action.value },
        },
      };
    case "DEVELOPMENT_PLACED":
      return {
        ...state,
        development: { ...state.development, placed: action.dev, error: null },
      };
    case "DEVELOPMENT_PLACING":
      return { ...state, development: { ...state.development, placing: true, error: null } };
    case "DEVELOPMENT_PLACE_ERROR":
      return {
        ...state,
        development: { ...state.development, placing: false, error: action.error },
      };
    case "START_EDIT_DEVELOPMENT": {
      const targetDev = action.dev || state.developments.selected || state.development.placed;
      if (!targetDev) return state;
      return {
        ...state,
        development: {
          ...state.development,
          type: targetDev.development_type || targetDev.type || "residential_compound",
          name: targetDev.name || "",
          floors: targetDev.floors || 5,
          properties: { ...(targetDev.properties || {}) },
          error: null,
        },
        ui: {
          ...state.ui,
          editingDevelopmentId: targetDev.development_id || targetDev.id,
          buildingReportsOpen: false,
        },
      };
    }
    case "CANCEL_EDIT_DEVELOPMENT":
      return {
        ...state,
        development: {
          ...state.development,
          error: null,
        },
        ui: {
          ...state.ui,
          editingDevelopmentId: null,
        },
      };
    case "DEVELOPMENT_UPDATED": {
      const updatedDev = action.dev;
      const devId = updatedDev.development_id || updatedDev.id;
      const updatedItems = state.developments.items.map((d) =>
        (d.development_id || d.id) === devId ? { ...d, ...updatedDev } : d
      );
      const isSelected =
        state.developments.selected &&
        (state.developments.selected.development_id === devId ||
          state.developments.selected.id === devId);
      const isPlaced =
        state.development.placed &&
        (state.development.placed.development_id === devId ||
          state.development.placed.id === devId);

      return {
        ...state,
        developments: {
          ...state.developments,
          items: updatedItems,
          selected: isSelected ? { ...state.developments.selected, ...updatedDev } : state.developments.selected,
          reloadToken: state.developments.reloadToken + 1,
        },
        development: {
          ...state.development,
          placed: isPlaced ? { ...state.development.placed, ...updatedDev } : state.development.placed,
          error: null,
        },
        // Stale traffic visualization clearance: roads return to baseline until What-If runs on updated config
        traffic: {
          ...state.traffic,
          scenario: null,
        },
        simulation: {
          ...state.simulation,
          result: null,
          error: null,
        },
        ui: {
          ...state.ui,
          editingDevelopmentId: null,
          fullReportOpen: false,
        },
      };
    }
    case "SET_NEW_SCENARIO":
      return {
        ...state,
        ui: {
          ...state.ui,
          fullReportOpen: false,
          selectedReport: null,
          buildingReportsOpen: false,
        },
        development: { ...initialState.development, placed: null },
        developments: { ...state.developments, selected: null, deleteError: null },
        simulation: { running: false, result: null, error: null, startedAt: null },
        traffic: { ...state.traffic, scenario: null },
        map: { ...state.map, selectedLocation: null, selectedRoad: null },
      };
    case "SIMULATION_RUNNING":
      return {
        ...state,
        ui: {
          ...state.ui,
          fullReportOpen: false,
        },
        simulation: { running: true, startedAt: Date.now(), error: null },
        traffic: { ...state.traffic, scenario: null },
      };
    case "SIMULATION_DONE": {
      const activeDev =
        state.development.placed ||
        state.developments.selected ||
        state.development;

      const reportRecord = createReportRecord({
        development: activeDev,
        simulationResult: action.result,
        scenarioName: activeDev?.name,
      });

      const updatedReports = addReportToCollection(state.reports, reportRecord);

      return {
        ...state,
        reports: updatedReports,
        simulation: {
          running: false,
          error: null,
          result: action.result,
          startedAt: state.simulation.startedAt,
        },
        traffic: {
          ...state.traffic,
          scenario: action.result?.stage4_impact_assessment?.road_assessments || [],
        },
        ui: {
          ...state.ui,
          selectedReport: reportRecord,
        },
      };
    }
    case "SIMULATION_ERROR":
      return {
        ...state,
        ui: {
          ...state.ui,
          fullReportOpen: false,
        },
        simulation: { running: false, error: action.error, result: null, startedAt: state.simulation.startedAt },
        traffic: { ...state.traffic, scenario: null },
      };
    case "OPEN_FULL_REPORT":
      return {
        ...state,
        ui: {
          ...state.ui,
          fullReportOpen: true,
          selectedReport: action.report !== undefined ? action.report : state.ui.selectedReport,
        },
      };
    case "CLOSE_FULL_REPORT":
      return {
        ...state,
        ui: {
          ...state.ui,
          fullReportOpen: false,
        },
      };
    case "OPEN_BUILDING_REPORTS":
      return {
        ...state,
        ui: {
          ...state.ui,
          buildingReportsOpen: true,
        },
      };
    case "CLOSE_BUILDING_REPORTS":
      return {
        ...state,
        ui: {
          ...state.ui,
          buildingReportsOpen: false,
        },
      };
    case "SET_ACTIVE_TAB":
      return {
        ...state,
        ui: {
          ...state.ui,
          activeTab: action.tab,
          fullReportOpen: action.tab === "scenarios" ? state.ui.fullReportOpen : false,
        },
      };
    case "TOGGLE_PANEL":
      return {
        ...state,
        ui: {
          ...state.ui,
          panelOpen: { ...state.ui.panelOpen, [action.panel]: !state.ui.panelOpen[action.panel] },
        },
      };
    case "RESET": {
      return {
        ...initialState,
        traffic: {
          ...initialState.traffic,
          baseline: state.traffic.baseline,
          scenario: null,
        },
        map: {
          ...state.map,
          layerVisibility: state.map.layerVisibility,
          basemap: state.map.basemap,
        },
      };
    }
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Context provider + consumer hook co-located in one store module;
// the react-refresh rule flags the extra hook export.
// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
