import { useEffect } from "react";
import { useApp } from "../store/AppContext.jsx";
import { listDevelopments } from "../api/developments.js";
import { ApiError } from "../api/client.js";

export function useDevelopments(active) {
  const { state, dispatch } = useApp();
  const reloadToken = state.developments.reloadToken;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      dispatch({ type: "DEVELOPMENTS_LOADING" });
      try {
        const items = await listDevelopments(controller.signal);
        if (cancelled) return;
        dispatch({ type: "DEVELOPMENTS_LOADED", items: Array.isArray(items) ? items : [] });
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        dispatch({
          type: "DEVELOPMENTS_ERROR",
          error: err instanceof ApiError ? err.message : "Failed to load developments",
        });
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, reloadToken, dispatch]);

  return state.developments;
}
