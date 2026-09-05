import { useEffect } from "react";
import { useApp } from "../store/AppContext.jsx";
import { getAllBaselineTraffic } from "../api/traffic.js";
import { ApiError } from "../api/client.js";

export function useTraffic(active = true) {
  const { state, dispatch } = useApp();

  useEffect(() => {
    if (!active || state.traffic.baseline) return;
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      dispatch({ type: "TRAFFIC_BASELINE_LOADING" });
      try {
        const res = await getAllBaselineTraffic(controller.signal);
        if (cancelled) return;
        const roads = Array.isArray(res?.roads) ? res.roads : [];
        dispatch({ type: "TRAFFIC_BASELINE_LOADED", roads });
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        dispatch({
          type: "TRAFFIC_BASELINE_ERROR",
          error: err instanceof ApiError ? err.message : "Failed to load baseline traffic",
        });
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, state.traffic.baseline, dispatch]);

  return state.traffic;
}
