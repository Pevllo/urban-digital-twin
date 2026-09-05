import { useEffect } from "react";
import { useApp } from "../store/AppContext.jsx";
import { getHealth, getCityInfo } from "../api/city.js";
import { getMapConfig } from "../api/map.js";
import { ApiError } from "../api/client.js";

export function useBackendStatus() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function check() {
      dispatch({ type: "BACKEND_CHECKING" });
      try {
        await getHealth(controller.signal);
        if (cancelled) return;
        dispatch({ type: "BACKEND_HEALTHY" });
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        dispatch({
          type: "BACKEND_OFFLINE",
          error: err instanceof ApiError ? err.message : "Backend unavailable",
        });
      }
    }

    check();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dispatch]);

  return state.backend;
}

export function useCityMetadata() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    if (state.city.loaded) return;
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const [info, mapConfig] = await Promise.all([
          getCityInfo(controller.signal),
          getMapConfig(controller.signal),
        ]);
        if (cancelled) return;
        dispatch({ type: "CITY_LOADED", info, mapConfig });
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        dispatch({ type: "CITY_ERROR", error: err instanceof ApiError ? err.message : "Failed to load city metadata" });
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [state.city.loaded, dispatch]);

  return state.city;
}
