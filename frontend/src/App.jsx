import { AppProvider } from "./store/AppContext.jsx";
import { AppShell } from "./components/layout/AppShell.jsx";
import { useBackendStatus, useCityMetadata } from "./hooks/useBackendStatus.js";
import { useDevelopments } from "./hooks/useDevelopments.js";
import { useTraffic } from "./hooks/useTraffic.js";

function DataLayer() {
  useBackendStatus();
  useCityMetadata();
  useDevelopments(true); // load existing developments from backend
  useTraffic(true); // load baseline traffic data
  return <AppShell />;
}

function Root() {
  return (
    <AppProvider>
      <DataLayer />
    </AppProvider>
  );
}

export default Root;