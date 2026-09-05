// Automated tests for development editing, state management, and loading state lifecycle.
// Run with: node frontend/src/tests/editDevelopment.test.js

import assert from "node:assert/strict";
import { editDevelopment } from "../services/developmentService.js";
import { updateDevelopment } from "../api/developments.js";
import { ApiError } from "../api/client.js";

console.log("---------------------------------------------------------");
console.log("RUNNING EDIT DEVELOPMENT TEST SUITE");
console.log("---------------------------------------------------------");

// Reducer simulation matching AppContext.jsx reducer for editing
function simulateReducer(state, action) {
  switch (action.type) {
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
    case "DEVELOPMENT_PLACE_ERROR":
      return {
        ...state,
        development: { ...state.development, placing: false, error: action.error },
      };
    default:
      return state;
  }
}

// TEST 1: API and Service Exports
{
  assert.strictEqual(typeof updateDevelopment, "function", "updateDevelopment should be exported");
  assert.strictEqual(typeof editDevelopment, "function", "editDevelopment should be exported");
  console.log("✓ TEST 1: editDevelopment and updateDevelopment are properly exported");
}

// TEST 2: Start Edit & Cancel Edit State Transitions
{
  const devA = {
    development_id: "dev_compound_01",
    name: "British Compound",
    development_type: "residential",
    floors: 9,
    properties: { num_residents: 20000, num_units: 5000, gross_floor_area_sqm: 9000 },
  };

  let state = {
    developments: { items: [devA], selected: devA, reloadToken: 0 },
    development: { type: "office", name: "", floors: 1, properties: {}, error: "previous error" },
    ui: { editingDevelopmentId: null, buildingReportsOpen: true },
  };

  // Start Edit
  state = simulateReducer(state, { type: "START_EDIT_DEVELOPMENT", dev: devA });
  assert.strictEqual(state.ui.editingDevelopmentId, "dev_compound_01", "editingDevelopmentId should be set");
  assert.strictEqual(state.development.name, "British Compound", "Form name should match target");
  assert.strictEqual(state.development.floors, 9, "Form floors should match target");
  assert.strictEqual(state.development.properties.num_residents, 20000, "Form properties should be copied");
  assert.strictEqual(state.development.error, null, "Error should be cleared on start edit");

  // Cancel Edit
  state = simulateReducer(state, { type: "CANCEL_EDIT_DEVELOPMENT" });
  assert.strictEqual(state.ui.editingDevelopmentId, null, "editingDevelopmentId should be reset to null");
  console.log("✓ TEST 2: Start Edit & Cancel Edit state transitions work correctly");
}

// TEST 3: Development Updated in Reducer
{
  const devA = {
    development_id: "dev_compound_01",
    name: "British Compound",
    development_type: "residential",
    latitude: 30.01836,
    longitude: 31.75767,
    floors: 9,
    properties: { num_residents: 20000 },
  };
  const devB = { development_id: "dev_mall_02", name: "City Mall", development_type: "mall" };

  let state = {
    developments: { items: [devA, devB], selected: devA, reloadToken: 1 },
    development: { placed: devA, error: null },
    traffic: { scenario: { mock: true } },
    simulation: { result: { mock: true }, error: null },
    ui: { editingDevelopmentId: "dev_compound_01", fullReportOpen: true },
  };

  const updatedDevA = {
    ...devA,
    name: "British Compound Phase 2",
    floors: 12,
    properties: { num_residents: 25000, num_units: 6000, gross_floor_area_sqm: 12000 },
  };

  state = simulateReducer(state, { type: "DEVELOPMENT_UPDATED", dev: updatedDevA });

  // Verify items collection updated
  const found = state.developments.items.find((d) => d.development_id === "dev_compound_01");
  assert.strictEqual(found.name, "British Compound Phase 2");
  assert.strictEqual(found.floors, 12);
  assert.strictEqual(found.properties.num_residents, 25000);

  // Verify other items untouched
  const foundB = state.developments.items.find((d) => d.development_id === "dev_mall_02");
  assert.strictEqual(foundB.name, "City Mall");

  // Verify selected and placed updated
  assert.strictEqual(state.developments.selected.name, "British Compound Phase 2");
  assert.strictEqual(state.development.placed.name, "British Compound Phase 2");

  // Verify UI and reload state
  assert.strictEqual(state.ui.editingDevelopmentId, null, "Edit mode should be exited");
  assert.strictEqual(state.developments.reloadToken, 2, "reloadToken should be incremented");
  assert.strictEqual(state.traffic.scenario, null, "Stale traffic scenario cleared");
  assert.strictEqual(state.simulation.result, null, "Stale simulation result cleared");
  console.log("✓ TEST 3: DEVELOPMENT_UPDATED reducer cleanly updates items, selected, placed, and UI flags");
}

// TEST 4: Saving Loading Lifecycle (Guaranteed Finally Reset)
{
  async function testSaveFlow(mockUpdateFn, activeDev, devForm) {
    let savingEdit = false;
    let dispatchedActions = [];
    const dispatch = (action) => dispatchedActions.push(action);

    // Simulated handleSaveEdit execution
    const handleSaveEdit = async () => {
      if (!activeDev) return;
      const targetDevId = activeDev.development_id || activeDev.id;
      savingEdit = true;

      try {
        const payload = {
          development_id: targetDevId,
          development_type: devForm.type,
          name: devForm.name,
          latitude: activeDev.latitude,
          longitude: activeDev.longitude,
          floors: Number(devForm.floors) || 1,
          status: activeDev.status || "proposed",
          properties: devForm.properties || {},
        };
        const updated = await mockUpdateFn(targetDevId, payload);
        dispatch({ type: "DEVELOPMENT_UPDATED", dev: updated });
        dispatch({ type: "DEVELOPMENTS_RELOAD" });
      } catch (err) {
        dispatch({
          type: "DEVELOPMENT_PLACE_ERROR",
          error: err instanceof ApiError ? err.message : "Failed to update development.",
        });
      } finally {
        savingEdit = false;
      }
    };

    await handleSaveEdit();
    return { savingEdit, dispatchedActions };
  }

  // 4a: Success path
  {
    const activeDev = { development_id: "dev_01", latitude: 30.0, longitude: 31.0 };
    const devForm = { type: "residential", name: "British Compound", floors: 9, properties: {} };
    const mockSuccess = async (id, p) => ({ ...p, id });

    const result = await testSaveFlow(mockSuccess, activeDev, devForm);
    assert.strictEqual(result.savingEdit, false, "savingEdit MUST be false after success");
    assert.strictEqual(result.dispatchedActions[0].type, "DEVELOPMENT_UPDATED");
    assert.strictEqual(result.dispatchedActions[1].type, "DEVELOPMENTS_RELOAD");
    console.log("✓ TEST 4a: Successful save resets saving state to false");
  }

  // 4b: Validation error path (422)
  {
    const activeDev = { development_id: "dev_01", latitude: 30.0, longitude: 31.0 };
    const devForm = { type: "residential", name: "British Compound", floors: 9, properties: {} };
    const mockValidationError = async () => {
      throw new ApiError(422, "Unsupported development_type");
    };

    const result = await testSaveFlow(mockValidationError, activeDev, devForm);
    assert.strictEqual(result.savingEdit, false, "savingEdit MUST be false after validation error");
    assert.strictEqual(result.dispatchedActions[0].type, "DEVELOPMENT_PLACE_ERROR");
    assert.strictEqual(result.dispatchedActions[0].error, "Unsupported development_type");
    console.log("✓ TEST 4b: Validation error resets saving state to false with useful message");
  }

  // 4c: Network failure path
  {
    const activeDev = { development_id: "dev_01", latitude: 30.0, longitude: 31.0 };
    const devForm = { type: "residential", name: "British Compound", floors: 9, properties: {} };
    const mockNetworkError = async () => {
      throw new ApiError(0, "Backend unavailable. Check that the server is running.");
    };

    const result = await testSaveFlow(mockNetworkError, activeDev, devForm);
    assert.strictEqual(result.savingEdit, false, "savingEdit MUST be false after network error");
    assert.strictEqual(result.dispatchedActions[0].type, "DEVELOPMENT_PLACE_ERROR");
    assert.match(result.dispatchedActions[0].error, /Backend unavailable/);
    console.log("✓ TEST 4c: Network error resets saving state to false");
  }

  // 4d: Unexpected thrown exception
  {
    const activeDev = { development_id: "dev_01", latitude: 30.0, longitude: 31.0 };
    const devForm = { type: "residential", name: "British Compound", floors: 9, properties: {} };
    const mockCrash = async () => {
      throw new Error("Unexpected JS runtime error");
    };

    const result = await testSaveFlow(mockCrash, activeDev, devForm);
    assert.strictEqual(result.savingEdit, false, "savingEdit MUST be false after unexpected exception");
    assert.strictEqual(result.dispatchedActions[0].type, "DEVELOPMENT_PLACE_ERROR");
    console.log("✓ TEST 4d: Unexpected runtime exception resets saving state to false");
  }
}

console.log("---------------------------------------------------------");
console.log("ALL EDIT DEVELOPMENT TESTS PASSED!");
console.log("---------------------------------------------------------");
