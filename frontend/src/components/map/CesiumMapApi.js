// Lightweight cross-component bridge to the Cesium viewer instance.
// The CesiumMap registers its internal API here so non-map components
// (e.g. toolbar, panels) can invoke map actions without wiring through props.
let apiRef = null;

export const CesiumMapApi = {
  register(api) {
    apiRef = api;
  },
  unregister() {
    apiRef = null;
  },
  flyToCity() {
    apiRef?.flyToCity?.();
  },
};
