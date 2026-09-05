import { AppProvider } from "./store/AppContext.jsx";
import { AppShell } from "./components/layout/AppShell.jsx";
import { useBackendStatus, useCityMetadata } from "./hooks/useBackendStatus.js";
import { useDevelopments } from "./hooks/useDevelopments.js";

function DataLayer() {
  useBackendStatus();
  useCityMetadata();
  useDevelopments(true); // load existing developments from backend
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