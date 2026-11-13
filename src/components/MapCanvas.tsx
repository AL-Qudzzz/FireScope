import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Crosshair,
  Globe,
  Maximize2,
  Plus,
  Minus,
} from 'lucide-react';
import {
  AoiDefinition,
  BoundingBox,
  CanonicalObservation,
  GeoPoint,
  PlatformId,
} from '../types/firescope';
import { calculateGeometryMeasurement } from '../science/fireScience';

export type BasemapStyle = 'satellite' | 'terrain' | 'reference';

export interface MapOverlaySettings {
  adminBoundaries: boolean;
  graticuleGrid: boolean;
  coastlines: boolean;
  pixelFootprints: boolean;
}

export type ActiveMapInteractionMode =
  | 'pan'
  | 'draw-bbox'
  | 'draw-polygon'
  | 'measure-distance'
  | 'measure-area';

interface MapHotspotsMeta {
  totalInViewport: number;
  totalGlobal: number;
  sampled: boolean;
  isLoading: boolean;
}

interface MapCanvasProps {
  activeAoi: AoiDefinition;
  observations: CanonicalObservation[];
  selectedObservationId: string | null;
  onSelectObservation: (obs: CanonicalObservation) => void;
  basemap: BasemapStyle;
  onChangeBasemap: (style: BasemapStyle) => void;
  overlays: MapOverlaySettings;
  interactionMode: ActiveMapInteractionMode;
  onFinishDrawBbox?: (bbox: BoundingBox) => void;
  onFinishDrawPolygon?: (points: GeoPoint[], bbox: BoundingBox) => void;
  measurePoints: GeoPoint[];
  onAddMeasurePoint: (pt: GeoPoint) => void;
  measureUnitSystem: 'metric' | 'imperial';
  compactPreview?: boolean;
  onOpenFullMap?: () => void;
  visiblePlatforms: PlatformId[];
  onViewportChange?: (viewport: {
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
  }) => void;
  hotspotsMeta?: MapHotspotsMeta;
  liveWindowMode?: 'today' | '24h' | 'archive';
  onSelectLiveWindow?: (mode: 'today' | '24h') => void;
}

const BASEMAP_LABELS: Record<BasemapStyle, string> = {
  satellite: 'Satellite',
  terrain: 'Terrain (OSM)',
  reference: 'OSM Map',
};

export const MapCanvas: React.FC<MapCanvasProps> = ({
  activeAoi,
  observations,
  selectedObservationId,
  onSelectObservation,
  basemap,
  onChangeBasemap,
  overlays,
  interactionMode,
  onFinishDrawBbox,
  onFinishDrawPolygon,
  measurePoints,
  onAddMeasurePoint,
  measureUnitSystem,
  compactPreview = false,
  onOpenFullMap,
  visiblePlatforms,
  onViewportChange,
  hotspotsMeta,
  liveWindowMode,
  onSelectLiveWindow,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const hybridOverlayRef = useRef<L.TileLayer | null>(null);

  // Native Leaflet LayerGroups so all vectors scale & pan at 60fps inside Leaflet's mapPane with zero lag
  const graticuleLayerRef = useRef<L.LayerGroup | null>(null);
  const aoiLayerRef = useRef<L.LayerGroup | null>(null);
  const hotspotsLayerRef = useRef<L.LayerGroup | null>(null);
  const interactiveDraftLayerRef = useRef<L.LayerGroup | null>(null);

  // Latest callbacks in refs for native Leaflet event listeners
  const onSelectObservationRef = useRef(onSelectObservation);
  onSelectObservationRef.current = onSelectObservation;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;
  const onAddMeasurePointRef = useRef(onAddMeasurePoint);
  onAddMeasurePointRef.current = onAddMeasurePoint;
  const onFinishDrawBboxRef = useRef(onFinishDrawBbox);
  onFinishDrawBboxRef.current = onFinishDrawBbox;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const [zoomLevel, setZoomLevel] = useState<number>(compactPreview ? 1 : 2);
  const [scaleKm, setScaleKm] = useState<number>(4500);
  const [cursorGeo, setCursorGeo] = useState<GeoPoint>({ lat: 15, lng: 15 });

  // Drawing states for AOI BBox or Polygon
  const bboxDraftStartRef = useRef<GeoPoint | null>(null);
  const bboxDraftRectRef = useRef<L.Rectangle | null>(null);
  const [polygonDraftPoints, setPolygonDraftPoints] = useState<GeoPoint[]>([]);

  // Filter observations by visible platforms
  const visibleObservations = useMemo(
    () => observations.filter((o) => visiblePlatforms.includes(o.platform)),
    [observations, visiblePlatforms]
  );

  const updateMapMetrics = useCallback((map: L.Map) => {
    const z = map.getZoom();
    setZoomLevel(z);

    const bounds = map.getBounds();
    const center = map.getCenter();
    const lngSpan = Math.max(0.02, Math.abs(bounds.getEast() - bounds.getWest()));
    const degAtTenPercent = lngSpan * 0.12;
    const km = degAtTenPercent * 111.32 * Math.cos((center.lat * Math.PI) / 180);
    if (km > 500) {
      setScaleKm(Math.round(km / 100) * 100);
    } else if (km > 50) {
      setScaleKm(Math.round(km / 10) * 10);
    } else {
      setScaleKm(Math.max(2, Math.round(km)));
    }

    if (onViewportChangeRef.current) {
      onViewportChangeRef.current({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
        zoom: z,
      });
    }
  }, []);

  // 1. Initialize Leaflet Map instance and native LayerGroups
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const renderer = L.canvas({ padding: 0.5 });
    canvasRendererRef.current = renderer;

    // OpenStreetMap Spherical Mercator CRS (EPSG:3857) projected from NASA WGS84 (EPSG:4326) datum
    // Latitude clamped to Web Mercator limits [-85.0511, 85.0511]; longitude unlocked for infinite horizontal looping
    const verticalOnlyBounds = L.latLngBounds(
      L.latLng(-85.05112878, -360000),
      L.latLng(85.05112878, 360000)
    );

    const map = L.map(container, {
      crs: L.CRS.EPSG3857,
      center: [15, 15],
      zoom: compactPreview ? 1 : 2,
      minZoom: compactPreview ? 1 : 2,
      maxZoom: 18,
      maxBounds: verticalOnlyBounds,
      maxBoundsViscosity: 0.85,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      renderer,
      worldCopyJump: true,
    });

    mapRef.current = map;

    graticuleLayerRef.current = L.layerGroup().addTo(map);
    aoiLayerRef.current = L.layerGroup().addTo(map);
    hotspotsLayerRef.current = L.layerGroup().addTo(map);
    interactiveDraftLayerRef.current = L.layerGroup().addTo(map);

    if (activeAoi.id === 'global-world') {
      map.setView([15, 15], compactPreview ? 1 : 2, { animate: false });
    } else {
      map.fitBounds(
        [
          [activeAoi.bbox.south, activeAoi.bbox.west],
          [activeAoi.bbox.north, activeAoi.bbox.east],
        ],
        {
          padding: compactPreview ? [22, 22] : [44, 44],
          maxZoom: 11,
          animate: false,
        }
      );
    }

    updateMapMetrics(map);

    const onMoveOrZoomEnd = () => updateMapMetrics(map);

    const normalizeLng = (rawLng: number) =>
      ((((rawLng + 180) % 360) + 360) % 360) - 180;

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const pt = {
        lat: Number(Math.max(-85, Math.min(85, e.latlng.lat)).toFixed(4)),
        lng: Number(normalizeLng(e.latlng.lng).toFixed(4)),
      };
      setCursorGeo(pt);

      if (interactionModeRef.current === 'draw-bbox' && bboxDraftStartRef.current) {
        const start = bboxDraftStartRef.current;
        const bounds: L.LatLngBoundsExpression = [
          [Math.min(start.lat, pt.lat), Math.min(start.lng, pt.lng)],
          [Math.max(start.lat, pt.lat), Math.max(start.lng, pt.lng)],
        ];
        if (bboxDraftRectRef.current) {
          bboxDraftRectRef.current.setBounds(bounds);
        } else if (interactiveDraftLayerRef.current) {
          bboxDraftRectRef.current = L.rectangle(bounds, {
            color: '#F0783C',
            weight: 2,
            fillColor: '#F0783C',
            fillOpacity: 0.2,
            interactive: false,
          }).addTo(interactiveDraftLayerRef.current);
        }
      }
    };

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (interactionModeRef.current === 'draw-bbox') {
        bboxDraftStartRef.current = {
          lat: Number(Math.max(-85, Math.min(85, e.latlng.lat)).toFixed(4)),
          lng: Number(normalizeLng(e.latlng.lng).toFixed(4)),
        };
      }
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (interactionModeRef.current === 'draw-bbox' && bboxDraftStartRef.current) {
        const start = bboxDraftStartRef.current;
        const end = {
          lat: Number(Math.max(-85, Math.min(85, e.latlng.lat)).toFixed(4)),
          lng: Number(normalizeLng(e.latlng.lng).toFixed(4)),
        };
        bboxDraftStartRef.current = null;
        if (bboxDraftRectRef.current && interactiveDraftLayerRef.current) {
          interactiveDraftLayerRef.current.removeLayer(bboxDraftRectRef.current);
          bboxDraftRectRef.current = null;
        }
        const west = Number(Math.min(start.lng, end.lng).toFixed(3));
        const east = Number(Math.max(start.lng, end.lng).toFixed(3));
        const south = Number(Math.min(start.lat, end.lat).toFixed(3));
        const north = Number(Math.max(start.lat, end.lat).toFixed(3));
        if (east - west > 0.05 && north - south > 0.05 && onFinishDrawBboxRef.current) {
          onFinishDrawBboxRef.current({ west, south, east, north });
        }
      }
    };

    const onClick = (e: L.LeafletMouseEvent) => {
      const mode = interactionModeRef.current;
      if (mode === 'pan' || mode === 'draw-bbox') return;
      const pt: GeoPoint = {
        lat: Number(Math.max(-85, Math.min(85, e.latlng.lat)).toFixed(4)),
        lng: Number(normalizeLng(e.latlng.lng).toFixed(4)),
      };
      if (mode === 'draw-polygon') {
        setPolygonDraftPoints((prev) => [...prev, pt]);
      } else if (mode === 'measure-distance' || mode === 'measure-area') {
        onAddMeasurePointRef.current(pt);
      }
    };

    map.on('moveend zoomend resize', onMoveOrZoomEnd);
    map.on('mousemove', onMouseMove);
    map.on('mousedown', onMouseDown);
    map.on('mouseup', onMouseUp);
    map.on('click', onClick);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      updateMapMetrics(map);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.off('moveend zoomend resize', onMoveOrZoomEnd);
      map.off('mousemove', onMouseMove);
      map.off('mousedown', onMouseDown);
      map.off('mouseup', onMouseUp);
      map.off('click', onClick);
      map.remove();
      mapRef.current = null;
      canvasRendererRef.current = null;
      baseTileLayerRef.current = null;
      hybridOverlayRef.current = null;
      graticuleLayerRef.current = null;
      aoiLayerRef.current = null;
      hotspotsLayerRef.current = null;
      interactiveDraftLayerRef.current = null;
    };
  }, []);

  // 2. Update Tile Layer whenever basemap or boundary overlays change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
      baseTileLayerRef.current = null;
    }
    if (hybridOverlayRef.current) {
      map.removeLayer(hybridOverlayRef.current);
      hybridOverlayRef.current = null;
    }

    if (basemap === 'satellite') {
      const satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 18,
          noWrap: false,
          crossOrigin: true,
        }
      );
      satLayer.addTo(map);
      baseTileLayerRef.current = satLayer;

      if (overlays.adminBoundaries || overlays.coastlines) {
        const refOverlay = L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          {
            maxZoom: 18,
            opacity: 0.85,
            noWrap: false,
            crossOrigin: true,
          }
        );
        refOverlay.addTo(map);
        hybridOverlayRef.current = refOverlay;
      }
    } else if (basemap === 'terrain') {
      const terrainLayer = L.tileLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 17,
          subdomains: ['a', 'b', 'c'],
          noWrap: false,
          crossOrigin: true,
        }
      );
      terrainLayer.addTo(map);
      baseTileLayerRef.current = terrainLayer;
    } else {
      const osmLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          subdomains: ['a', 'b', 'c'],
          noWrap: false,
          crossOrigin: true,
        }
      );
      osmLayer.addTo(map);
      baseTileLayerRef.current = osmLayer;
    }
  }, [basemap, overlays.adminBoundaries, overlays.coastlines]);

  // 3. Fit bounds whenever activeAoi changes
  const bboxKey = `${activeAoi.id}:${activeAoi.bbox.west},${activeAoi.bbox.south},${activeAoi.bbox.east},${activeAoi.bbox.north}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeAoi.id === 'global-world') {
      map.setView([15, 15], compactPreview ? 1 : 2, { animate: false });
    } else {
      map.fitBounds(
        [
          [activeAoi.bbox.south, activeAoi.bbox.west],
          [activeAoi.bbox.north, activeAoi.bbox.east],
        ],
        {
          padding: compactPreview ? [22, 22] : [44, 44],
          maxZoom: 11,
          animate: false,
        }
      );
    }
    updateMapMetrics(map);
  }, [activeAoi.id, bboxKey, compactPreview, updateMapMetrics]);

  // 4. Enable/disable Leaflet dragging depending on interactionMode
  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container) return;
    if (interactionMode === 'pan') {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      container.style.cursor = 'grab';
    } else {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      container.style.cursor = 'crosshair';
    }
  }, [interactionMode]);

  // 5. Render WGS84 Graticule Grid natively inside Leaflet LayerGroup
  useEffect(() => {
    const group = graticuleLayerRef.current;
    const renderer = canvasRendererRef.current;
    if (!group || !renderer) return;
    group.clearLayers();

    if (!overlays.graticuleGrid) return;

    for (let lng = -540; lng <= 540; lng += 30) {
      L.polyline(
        [
          [-80, lng],
          [80, lng],
        ],
        {
          renderer,
          color: 'rgba(232, 238, 242, 0.14)',
          weight: 1,
          interactive: false,
        }
      ).addTo(group);
    }

    for (let lat = -60; lat <= 60; lat += 30) {
      L.polyline(
        [
          [lat, -540],
          [lat, 540],
        ],
        {
          renderer,
          color: 'rgba(232, 238, 242, 0.14)',
          weight: 1,
          interactive: false,
        }
      ).addTo(group);
    }
  }, [overlays.graticuleGrid]);

  // 6. Render Selected AOI Boundary natively inside Leaflet LayerGroup
  useEffect(() => {
    const group = aoiLayerRef.current;
    const renderer = canvasRendererRef.current;
    if (!group || !renderer) return;
    group.clearLayers();

    if (activeAoi.id === 'global-world') return;

    if (
      activeAoi.geometryType === 'POLYGON' &&
      activeAoi.polygon &&
      activeAoi.polygon.length >= 3
    ) {
      L.polygon(
        activeAoi.polygon.map((pt) => [pt.lat, pt.lng] as [number, number]),
        {
          renderer,
          color: '#F0783C',
          weight: 2.2,
          dashArray: '6, 4',
          fillColor: '#F0783C',
          fillOpacity: 0.1,
          interactive: false,
        }
      ).addTo(group);
    } else {
      L.rectangle(
        [
          [activeAoi.bbox.south, activeAoi.bbox.west],
          [activeAoi.bbox.north, activeAoi.bbox.east],
        ],
        {
          renderer,
          color: '#F0783C',
          weight: 2,
          dashArray: '6, 4',
          fillColor: '#F0783C',
          fillOpacity: 0.08,
          interactive: false,
        }
      ).addTo(group);
    }
  }, [activeAoi]);

  // 7. Render Red Fire Hotspot Points & Halos natively inside Leaflet's Canvas LayerGroup (0ms zoom/pan lag!)
  const isGlobalZoom = zoomLevel <= 3;
  const isLocalZoom = zoomLevel >= 8;

  useEffect(() => {
    const group = hotspotsLayerRef.current;
    const renderer = canvasRendererRef.current;
    if (!group || !renderer) return;
    group.clearLayers();

    const haloRadius = isGlobalZoom ? 3.8 : isLocalZoom ? 7.5 : 4.8;
    const pointRadiusModis = isGlobalZoom ? 2.2 : isLocalZoom ? 4.4 : 2.9;
    const pointRadiusViirs = isGlobalZoom ? 1.9 : isLocalZoom ? 3.8 : 2.5;

    // Render across -360°, 0°, and +360° world copies so scrolling infinitely across the antimeridian always displays hotspots seamlessly
    const worldLngOffsets = [-360, 0, 360];

    for (const obs of visibleObservations) {
      const isModis = obs.sensor === 'MODIS';
      const isSelected = obs.observation_id === selectedObservationId;

      for (const lngOffset of worldLngOffsets) {
        const latlng: [number, number] = [obs.latitude, obs.longitude + lngOffset];

        // 1. Subtle Red Thermal Halo
        L.circleMarker(latlng, {
          renderer,
          radius: haloRadius,
          stroke: false,
          fillColor: '#EF4444',
          fillOpacity: isGlobalZoom ? 0.14 : 0.18,
          interactive: false,
        }).addTo(group);

        // 2. Optional Native Pixel Footprint (scan × track in km) on primary world copy
        if (overlays.pixelFootprints && lngOffset === 0) {
          const trackKm = obs.track_native ?? (isModis ? 1.0 : 0.375);
          const scanKm = obs.scan_native ?? (isModis ? 1.0 : 0.375);
          const latHalf = trackKm / 111.32 / 2;
          const lngHalf =
            scanKm /
            (111.32 * Math.max(0.2, Math.cos((obs.latitude * Math.PI) / 180))) /
            2;

          L.rectangle(
            [
              [obs.latitude - latHalf, obs.longitude - lngHalf],
              [obs.latitude + latHalf, obs.longitude + lngHalf],
            ],
            {
              renderer,
              color: '#EF4444',
              weight: 1,
              fillColor: '#EF4444',
              fillOpacity: 0.22,
              interactive: false,
            }
          ).addTo(group);
        }

        // 3. Selection Target Ring
        if (isSelected) {
          L.circleMarker(latlng, {
            renderer,
            radius: 10,
            color: '#FFFFFF',
            weight: 2.2,
            fillColor: '#EF4444',
            fillOpacity: 0.35,
            interactive: false,
          }).addTo(group);
        }

        // 4. Individual Vivid Red Fire Hotspot Pinpoint (NASA FIRMS style)
        const marker = L.circleMarker(latlng, {
          renderer,
          radius: isModis ? pointRadiusModis : pointRadiusViirs,
          color: '#991B1B',
          weight: isGlobalZoom ? 0.45 : 0.75,
          fillColor: isModis ? '#FF2A2A' : '#EF4444',
          fillOpacity: 0.96,
        });

        marker.bindTooltip(
          `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.35;">
            <strong style="color:#F87171;">Titik Api · ${obs.sensor} (${obs.platform})</strong><br/>
            Product: ${obs.source_product} · Conf: ${obs.confidence_native ?? '—'}<br/>
            UTC: ${obs.acq_datetime_utc}<br/>
            Koordinat: ${obs.latitude.toFixed(4)}°, ${obs.longitude.toFixed(4)}°<br/>
            FRP: ${obs.frp_mw !== null ? `${obs.frp_mw} MW` : 'Unavailable'}
          </div>`,
          {
            direction: 'top',
            offset: [0, -6],
            className: 'firescope-leaflet-tooltip',
          }
        );

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectObservationRef.current(obs);
        });

        marker.addTo(group);

        // 5. Pinpoint core only when zoomed closely to inspect overlapping detections
        if (isLocalZoom) {
          L.circleMarker(latlng, {
            renderer,
            radius: 1.0,
            stroke: false,
            fillColor: '#FEE2E2',
            fillOpacity: 0.9,
            interactive: false,
          }).addTo(group);
        }
      }
    }
  }, [
    visibleObservations,
    selectedObservationId,
    overlays.pixelFootprints,
    isGlobalZoom,
    isLocalZoom,
  ]);

  // 8. Render Active Polygon Draft & Measurement Geometry natively inside Leaflet
  const measureStats = useMemo(
    () => calculateGeometryMeasurement(measurePoints),
    [measurePoints]
  );

  useEffect(() => {
    const group = interactiveDraftLayerRef.current;
    const renderer = canvasRendererRef.current;
    if (!group || !renderer) return;
    group.clearLayers();
    bboxDraftRectRef.current = null;

    if (polygonDraftPoints.length > 0) {
      const latlngs = polygonDraftPoints.map(
        (pt) => [pt.lat, pt.lng] as [number, number]
      );
      L.polygon(latlngs, {
        renderer,
        color: '#F0783C',
        weight: 2,
        fillColor: '#F0783C',
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(group);

      for (const pt of polygonDraftPoints) {
        L.circleMarker([pt.lat, pt.lng], {
          renderer,
          radius: 4.5,
          color: '#F0783C',
          weight: 2,
          fillColor: '#FFFFFF',
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
      }
    }

    if (measurePoints.length > 0) {
      const latlngs = measurePoints.map(
        (pt) => [pt.lat, pt.lng] as [number, number]
      );
      if (interactionMode === 'measure-area' && measurePoints.length >= 3) {
        L.polygon(latlngs, {
          renderer,
          color: '#61BDE0',
          weight: 2,
          dashArray: '4, 3',
          fillColor: '#61BDE0',
          fillOpacity: 0.2,
          interactive: false,
        }).addTo(group);
      } else {
        L.polyline(latlngs, {
          renderer,
          color: '#61BDE0',
          weight: 2,
          dashArray: '4, 3',
          interactive: false,
        }).addTo(group);
      }

      for (const pt of measurePoints) {
        L.circleMarker([pt.lat, pt.lng], {
          renderer,
          radius: 4,
          color: '#61BDE0',
          weight: 2,
          fillColor: '#FFFFFF',
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
      }
    }
  }, [polygonDraftPoints, measurePoints, interactionMode]);

  const handleZoomIn = () => {
    const map = mapRef.current;
    if (map) map.zoomIn();
  };

  const handleZoomOut = () => {
    const map = mapRef.current;
    if (map) map.zoomOut();
  };

  const handleFitAoi = () => {
    const map = mapRef.current;
    if (!map) return;
    if (activeAoi.id === 'global-world') {
      map.setView([15, 15], compactPreview ? 1 : 2, { animate: false });
    } else {
      map.fitBounds(
        [
          [activeAoi.bbox.south, activeAoi.bbox.west],
          [activeAoi.bbox.north, activeAoi.bbox.east],
        ],
        {
          padding: compactPreview ? [22, 22] : [44, 44],
          maxZoom: 11,
          animate: false,
        }
      );
    }
    updateMapMetrics(map);
  };

  const handleGlobalView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([15, 15], compactPreview ? 1 : 2, { animate: false });
    updateMapMetrics(map);
  };

  return (
    <div
      data-testid="firescope-map-canvas"
      className="relative w-full h-full bg-[#07131D] overflow-hidden select-none"
    >
      {/* Native Leaflet OpenStreetMap / Satellite Slippy Map + Hardware-Accelerated Canvas Overlay */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* Upper-Left Map Navigation Control Rail (Section 5.5) */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
        <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md flex flex-col overflow-hidden shadow-md">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in (+)"
            className="w-9 h-9 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-3)] border-b border-[var(--border-subtle)] transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out (-)"
            className="w-9 h-9 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md flex flex-col overflow-hidden shadow-md">
          <button
            type="button"
            onClick={handleFitAoi}
            aria-label="Return to selected AOI extent"
            title="Fit map to selected Area of Interest"
            className="w-9 h-9 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-3)] border-b border-[var(--border-subtle)] transition-colors"
          >
            <Crosshair className="w-4 h-4 text-[var(--ember)]" />
          </button>
          <button
            type="button"
            onClick={handleGlobalView}
            aria-label="Reset to global view"
            title="Reset to global view"
            className="w-9 h-9 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <Globe className="w-4 h-4" />
          </button>
        </div>

        {compactPreview && onOpenFullMap && (
          <button
            type="button"
            onClick={onOpenFullMap}
            aria-label="Open full-screen Map Explorer"
            title="Expand in Map Explorer"
            className="w-9 h-9 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-3)] shadow-md transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Active Drawing / Polygon Instruction Banner */}
      {interactionMode === 'draw-polygon' && (
        <div className="absolute top-3 left-16 z-20 bg-[var(--surface-1)] border border-[var(--ember)] px-3 py-1.5 rounded-md flex items-center gap-3 text-[12px] shadow-md">
          <span className="text-[var(--text-primary)]">
            Click map to place polygon vertices ({polygonDraftPoints.length} placed)
          </span>
          {polygonDraftPoints.length >= 3 && onFinishDrawPolygon && (
            <button
              type="button"
              onClick={() => {
                const lats = polygonDraftPoints.map((p) => p.lat);
                const lngs = polygonDraftPoints.map((p) => p.lng);
                const bbox: BoundingBox = {
                  west: Math.min(...lngs),
                  east: Math.max(...lngs),
                  south: Math.min(...lats),
                  north: Math.max(...lats),
                };
                onFinishDrawPolygon(polygonDraftPoints, bbox);
                setPolygonDraftPoints([]);
              }}
              className="px-2 py-0.5 rounded bg-[var(--ember)] text-white font-medium hover:bg-[var(--ember-hover)]"
            >
              Finish Polygon
            </button>
          )}
          {polygonDraftPoints.length > 0 && (
            <button
              type="button"
              onClick={() => setPolygonDraftPoints((prev) => prev.slice(0, -1))}
              className="px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Undo Point
            </button>
          )}
        </div>
      )}

      {/* Active Measurement Readout Banner */}
      {measurePoints.length >= 2 && (
        <div className="absolute top-3 left-16 z-20 bg-[var(--surface-1)]/95 border border-[var(--border-subtle)] px-3 py-1.5 rounded-md font-mono text-[11px] text-[var(--text-primary)] shadow-md">
          {interactionMode === 'measure-area' && measurePoints.length >= 3
            ? `Measured Geometry Area: ${
                measureUnitSystem === 'metric'
                  ? `${measureStats.areaSqKm.toLocaleString()} km²`
                  : `${measureStats.areaSqMi.toLocaleString()} mi²`
              }`
            : `Measured Distance: ${
                measureUnitSystem === 'metric'
                  ? `${measureStats.distanceKm.toLocaleString()} km`
                  : `${measureStats.distanceMi.toLocaleString()} mi`
              }`}
        </div>
      )}

      {/* Upper-Right Basemap Selector, FIRMS Time Mode & Red Fire Hotspot Legend */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        <div className="bg-[var(--surface-1)]/95 border border-[var(--border-subtle)] rounded-md p-0.5 flex items-center gap-0.5 text-[11px] shadow-md">
          {(['satellite', 'terrain', 'reference'] as BasemapStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onChangeBasemap(style)}
              className={`px-2 py-1 rounded font-medium transition-colors ${
                basemap === style
                  ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {BASEMAP_LABELS[style]}
            </button>
          ))}
        </div>

        {/* NASA FIRMS Live Window Toggle (TODAY UTC vs 24HRS) */}
        {!compactPreview && onSelectLiveWindow && (
          <div
            role="group"
            aria-label="NASA FIRMS live time window"
            className="bg-[var(--surface-1)]/95 border border-[var(--border-subtle)] rounded-md p-0.5 flex items-center gap-0.5 text-[11px] shadow-md font-mono"
          >
            <button
              type="button"
              onClick={() => onSelectLiveWindow('today')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                liveWindowMode === 'today'
                  ? 'bg-[var(--ember)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              TODAY UTC
            </button>
            <button
              type="button"
              onClick={() => onSelectLiveWindow('24h')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                liveWindowMode === '24h'
                  ? 'bg-[var(--ember)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              24HRS LIVE
            </button>
          </div>
        )}

        {/* Red Fire Hotspot Legend */}
        <div className="bg-[var(--surface-1)]/95 border border-[var(--border-subtle)] rounded-md px-2.5 py-2 text-[11px] space-y-1 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#EF4444] border border-[#FCA5A5] inline-block rounded-full shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            <span className="text-[var(--text-primary)] font-medium">Titik Api · VIIRS C2</span>
            <span className="text-[var(--text-muted)] font-mono">375 m</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#DC2626] border border-[#FCA5A5] inline-block rounded-full shrink-0 shadow-[0_0_6px_rgba(220,38,38,0.8)]" />
            <span className="text-[var(--text-primary)] font-medium">Titik Api · MODIS C6.1</span>
            <span className="text-[var(--text-muted)] font-mono">1 km</span>
          </div>
        </div>
      </div>

      {/* Bottom-Left Map Scale and Coordinate Readout (Section 5.1) */}
      <div className="absolute bottom-2.5 left-2.5 z-20 bg-[var(--surface-1)]/95 border border-[var(--border-subtle)] rounded-md px-2 py-1 flex items-center gap-2 text-[10px] md:text-[11px] font-mono tabular-nums text-[var(--text-secondary)] shadow-md">
        <div className="flex items-center gap-1.5">
          <div className="w-8 md:w-10 h-1.5 border-b-2 border-l-2 border-r-2 border-[var(--text-secondary)]" />
          <span>{scaleKm} km</span>
        </div>
        <span className="text-[var(--border-subtle)]">|</span>
        <span>
          {cursorGeo.lat.toFixed(4)}°, {cursorGeo.lng.toFixed(4)}° (WGS84)
        </span>
        {!compactPreview && (
          <>
            <span className="text-[var(--border-subtle)]">|</span>
            <span>Datum: EPSG:4326 → OSM EPSG:3857</span>
            <span className="text-[var(--border-subtle)]">|</span>
            <span>
              {hotspotsMeta
                ? hotspotsMeta.isLoading
                  ? 'Syncing NASA FIRMS...'
                  : hotspotsMeta.sampled
                  ? `Showing ${visibleObservations.length.toLocaleString()} / ${hotspotsMeta.totalInViewport.toLocaleString()} FIRMS in view`
                  : `FIRMS in view: ${visibleObservations.length.toLocaleString()} (100% live)`
                : `Visible records: ${visibleObservations.length.toLocaleString()}`}
            </span>
          </>
        )}
      </div>

      {/* Bottom-Right OpenStreetMap, Satellite & NASA Source Attribution (Section 5.1) */}
      <div className="absolute bottom-2.5 right-2.5 z-20 bg-[var(--surface-1)]/90 border border-[var(--border-subtle)] rounded px-2 py-1 text-[10px] text-[var(--text-muted)]">
        {compactPreview
          ? '© OpenStreetMap · Satellite · NASA FIRMS'
          : '© OpenStreetMap contributors · Satellite Imagery · NASA FIRMS (MODIS C6.1 & VIIRS C2)'}
      </div>
    </div>
  );
};
