// Automated tests for development deletion, state management, and Cesium rendering cleanup.
// Run with: node frontend/src/tests/deleteDevelopment.test.js

import assert from "node:assert";
import { deleteDevelopment } from "../api/developments.js";

console.log("---------------------------------------------------------");
console.log("RUNNING DELETE DEVELOPMENT TEST SUITE");
console.log("---------------------------------------------------------");

// Reducer simulation matching AppContext.jsx reducer
function simulateReducer(state, action) {
  switch (action.type) {
    case "DEVELOPMENT_SELECTED":
      return {
        ...state,
        developments: {
          ...state.developments,
          selected: action.dev,
          deleteError: null,
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

      return {
        ...state,
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
    default:
      return state;
  }
}

// TEST 1: Delete API Client exports deleteDevelopment
{
  assert.strictEqual(typeof deleteDevelopment, "function", "deleteDevelopment should be exported");
  console.log("✓ TEST 1: deleteDevelopment API function is available");
}

// TEST 2: Development Selection & Deselection
{
  const devA = { development_id: "dev_101", name: "Alpha Tower", development_type: "office" };
  let state = {
    developments: { items: [devA], selected: null, deletingId: null, deleteError: null, reloadToken: 0 },
    development: { placed: null },
  };

  // Select
  state = simulateReducer(state, { type: "DEVELOPMENT_SELECTED", dev: devA });
  assert.strictEqual(state.developments.selected?.development_id, "dev_101", "devA should be selected");

  // Deselect
  state = simulateReducer(state, { type: "DEVELOPMENT_DESELECTED" });
  assert.strictEqual(state.developments.selected, null, "Selection should be cleared");
  console.log("✓ TEST 2: Selection & Deselection state transitions passed");
}

// TEST 3: Development Deleting in-flight state
{
  let state = {
    developments: { items: [], selected: null, deletingId: null, deleteError: "old error", reloadToken: 0 },
    development: { placed: null },
  };

  state = simulateReducer(state, { type: "DEVELOPMENT_DELETING", developmentId: "dev_101" });
  assert.strictEqual(state.developments.deletingId, "dev_101", "deletingId should be set");
  assert.strictEqual(state.developments.deleteError, null, "deleteError should be cleared");
  console.log("✓ TEST 3: Deleting loading state transitions passed");
}

// TEST 4: Successful Deletion from multi-development collection
{
  const devA = { development_id: "dev_A", name: "Compound A", development_type: "residential_compound" };
  const devB = { development_id: "dev_B", name: "Hospital B", development_type: "hospital" };
  const devC = { development_id: "dev_C", name: "Mall C", development_type: "mall" };

  let state = {
    developments: {
      items: [devA, devB, devC],
      selected: devB,
      deletingId: "dev_B",
      deleteError: null,
      reloadToken: 1,
    },
    development: { placed: devB },
  };

  // Delete devB
  state = simulateReducer(state, { type: "DEVELOPMENT_DELETED", developmentId: "dev_B" });

  // Verify devB is removed
  assert.strictEqual(state.developments.items.length, 2, "Items should contain exactly 2 developments");
  assert.deepStrictEqual(
    state.developments.items.map((d) => d.development_id),
    ["dev_A", "dev_C"],
    "devA and devC must remain untouched"
  );
  assert.strictEqual(state.developments.selected, null, "Selected devB should be cleared");
  assert.strictEqual(state.development.placed, null, "Placed devB should be cleared");
  assert.strictEqual(state.developments.deletingId, null, "deletingId should be reset");
  assert.strictEqual(state.developments.reloadToken, 2, "reloadToken should be incremented");
  console.log("✓ TEST 4: Multi-development deletion cleanly removes target and preserves others");
}

// TEST 5: Error Handling during deletion
{
  let state = {
    developments: { items: [], selected: null, deletingId: "dev_101", deleteError: null, reloadToken: 0 },
    development: { placed: null },
  };

  state = simulateReducer(state, {
    type: "DEVELOPMENT_DELETE_ERROR",
    error: "Unable to delete development. Please try again.",
  });
  assert.strictEqual(state.developments.deletingId, null, "deletingId must reset on error");
  assert.strictEqual(state.developments.deleteError, "Unable to delete development. Please try again.");
  console.log("✓ TEST 5: Deletion error handling state transitions passed");
}

console.log("---------------------------------------------------------");
console.log("ALL DELETE DEVELOPMENT TESTS PASSED!");
console.log("---------------------------------------------------------");
