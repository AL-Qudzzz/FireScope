import { AoiDefinition, SavedAoiRecord } from '../types/firescope';
import { validateBoundingBox } from '../science/fireScience';

export const SAVED_AOIS_STORAGE_KEY = 'firescope.saved_aois.v1';

interface MinimalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function resolveStorage(storage?: MinimalStorage): MinimalStorage | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function loadSavedAois(storage?: MinimalStorage): SavedAoiRecord[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(SAVED_AOIS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedAoiRecord =>
        Boolean(item?.aoi?.id) &&
        Boolean(item?.aoi?.name) &&
        Boolean(item?.aoi?.bbox) &&
        validateBoundingBox(item.aoi.bbox).valid
    );
  } catch {
    return [];
  }
}

function persistSavedAois(records: SavedAoiRecord[], storage?: MinimalStorage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(SAVED_AOIS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function saveAoiRecord(
  aoi: AoiDefinition,
  customLabel?: string,
  storage?: MinimalStorage
): SavedAoiRecord[] {
  const existing = loadSavedAois(storage);
  const label = customLabel?.trim() || aoi.name;
  const savedId = aoi.id.startsWith('saved-')
    ? aoi.id
    : `saved-${aoi.id}-${Math.abs(Math.round(aoi.bbox.west * 100))}-${Date.now().toString(36)}`;

  const cleanAoi: AoiDefinition = {
    ...aoi,
    id: savedId,
    name: label,
    isPreset: false,
  };

  const withoutDupBbox = existing.filter(
    (rec) =>
      !(
        rec.aoi.id === cleanAoi.id ||
        (Math.abs(rec.aoi.bbox.west - cleanAoi.bbox.west) < 0.001 &&
          Math.abs(rec.aoi.bbox.east - cleanAoi.bbox.east) < 0.001 &&
          Math.abs(rec.aoi.bbox.south - cleanAoi.bbox.south) < 0.001 &&
          Math.abs(rec.aoi.bbox.north - cleanAoi.bbox.north) < 0.001 &&
          rec.aoi.name === cleanAoi.name)
      )
  );

  const next: SavedAoiRecord[] = [
    { aoi: cleanAoi, savedAtUtc: new Date().toISOString() },
    ...withoutDupBbox,
  ].slice(0, 25);

  persistSavedAois(next, storage);
  return next;
}

export function renameSavedAoi(
  aoiId: string,
  newName: string,
  storage?: MinimalStorage
): SavedAoiRecord[] {
  const trimmed = newName.trim();
  const existing = loadSavedAois(storage);
  if (!trimmed) return existing;
  const next = existing.map((rec) =>
    rec.aoi.id === aoiId ? { ...rec, aoi: { ...rec.aoi, name: trimmed } } : rec
  );
  persistSavedAois(next, storage);
  return next;
}

export function deleteSavedAoi(
  aoiId: string,
  storage?: MinimalStorage
): SavedAoiRecord[] {
  const existing = loadSavedAois(storage);
  const next = existing.filter((rec) => rec.aoi.id !== aoiId);
  persistSavedAois(next, storage);
  return next;
}
