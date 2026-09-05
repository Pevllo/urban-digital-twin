export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatLargeNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return `${Number(value).toFixed(1)}%`;
}

export function formatLat(lat) {
  if (lat === null || lat === undefined || Number.isNaN(Number(lat))) return "--";
  return `${Number(lat).toFixed(5)}°${Number(lat) >= 0 ? "N" : "S"}`;
}

export function formatLon(lon) {
  if (lon === null || lon === undefined || Number.isNaN(Number(lon))) return "--";
  return `${Number(lon).toFixed(5)}°${Number(lon) >= 0 ? "E" : "W"}`;
}
