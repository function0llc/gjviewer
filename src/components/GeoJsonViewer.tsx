"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Position = [number, number, ...number[]];

type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] }
  | { type: "GeometryCollection"; geometries: Geometry[] };

type Feature = {
  type: "Feature";
  geometry: Geometry | null;
  properties?: Record<string, unknown> | null;
};

type GeoJson =
  | Feature
  | {
      type: "FeatureCollection";
      features: Feature[];
    }
  | Geometry;

type DrawShape =
  | { kind: "point"; point: Position }
  | { kind: "line"; points: Position[] }
  | { kind: "polygon"; rings: Position[][] };

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Layer = {
  id: string;
  name: string;
  data: GeoJson;
  color: string;
  visible: boolean;
};

const LAYER_COLORS = [
  "#f2c66d",
  "#68b984",
  "#7eb8da",
  "#e88a7a",
  "#b49ee8",
  "#e8c47a",
  "#84c4b0",
  "#d48eaa",
];

const SAMPLE_GEOJSON: GeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Harbor district", category: "area" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122.432, 37.781],
            [-122.416, 37.789],
            [-122.397, 37.776],
            [-122.405, 37.759],
            [-122.428, 37.762],
            [-122.432, 37.781],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Survey route", category: "line" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-122.438, 37.768],
          [-122.423, 37.775],
          [-122.409, 37.772],
          [-122.391, 37.784],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Observation point", category: "point" },
      geometry: { type: "Point", coordinates: [-122.414, 37.779] },
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isGeometry(value: unknown): value is Geometry {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "GeometryCollection") {
    return Array.isArray(value.geometries);
  }

  return "coordinates" in value;
}

function isFeature(value: unknown): value is Feature {
  return (
    isRecord(value) &&
    value.type === "Feature" &&
    (value.geometry === null || isGeometry(value.geometry))
  );
}

function isGeoJson(value: unknown): value is GeoJson {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "FeatureCollection") {
    return Array.isArray(value.features) && value.features.every(isFeature);
  }

  return isFeature(value) || isGeometry(value);
}

function featuresFromGeoJson(data: GeoJson): Feature[] {
  if (data.type === "FeatureCollection") {
    return data.features;
  }

  if (data.type === "Feature") {
    return [data];
  }

  return [{ type: "Feature", geometry: data, properties: { type: data.type } }];
}

function shapesFromGeometry(geometry: Geometry | null): DrawShape[] {
  if (!geometry) {
    return [];
  }

  switch (geometry.type) {
    case "Point":
      return isPosition(geometry.coordinates)
        ? [{ kind: "point", point: geometry.coordinates }]
        : [];
    case "MultiPoint":
      return geometry.coordinates
        .filter(isPosition)
        .map((point) => ({ kind: "point", point }));
    case "LineString":
      return [{ kind: "line", points: geometry.coordinates.filter(isPosition) }];
    case "MultiLineString":
      return geometry.coordinates.map((points) => ({
        kind: "line",
        points: points.filter(isPosition),
      }));
    case "Polygon":
      return [{ kind: "polygon", rings: geometry.coordinates }];
    case "MultiPolygon":
      return geometry.coordinates.map((rings) => ({ kind: "polygon", rings }));
    case "GeometryCollection":
      return geometry.geometries.flatMap(shapesFromGeometry);
  }
}

function positionsFromShape(shape: DrawShape): Position[] {
  if (shape.kind === "point") {
    return [shape.point];
  }

  if (shape.kind === "line") {
    return shape.points;
  }

  return shape.rings.flat();
}

function getBounds(shapes: DrawShape[]): Bounds | null {
  const positions = shapes.flatMap(positionsFromShape).filter(isPosition);

  if (positions.length === 0) {
    return null;
  }

  return positions.reduce<Bounds>(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y),
    }),
    {
      minX: positions[0][0],
      minY: positions[0][1],
      maxX: positions[0][0],
      maxY: positions[0][1],
    },
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 5,
  }).format(value);
}

function stringifyProperty(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "-";
  }

  return JSON.stringify(value);
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function GeoJsonViewer() {
  const [layers, setLayers] = useState<Layer[]>([
    { id: "sample", name: "Sample data", data: SAMPLE_GEOJSON, color: LAYER_COLORS[0], visible: true },
  ]);
  const [error, setError] = useState<string | null>(null);

  const visibleLayers = useMemo(() => layers.filter((l) => l.visible), [layers]);

  const layerData = useMemo(
    () =>
      visibleLayers.map((layer) => ({
        layer,
        features: featuresFromGeoJson(layer.data),
      })),
    [visibleLayers],
  );

  const allShapes = useMemo(
    () =>
      layerData.flatMap(({ layer, features }) =>
        features.flatMap((f) =>
          shapesFromGeometry(f.geometry).map((s) => ({ ...s, color: layer.color, layerId: layer.id })),
        ),
      ),
    [layerData],
  );

  const bounds = useMemo(() => getBounds(allShapes), [allShapes]);

  const totalFeatures = useMemo(
    () => layerData.reduce((sum, { features }) => sum + features.length, 0),
    [layerData],
  );

  const totalShapes = allShapes.length;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    const newLayers: Layer[] = [];

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        if (!isGeoJson(parsed)) {
          throw new Error(`${file.name} is not valid GeoJSON.`);
        }

        newLayers.push({
          id: `layer-${Date.now()}-${file.name}`,
          name: file.name,
          data: parsed,
          color: LAYER_COLORS[layers.length + newLayers.length] ?? LAYER_COLORS[(layers.length + newLayers.length) % LAYER_COLORS.length],
          visible: true,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : `Could not read ${file.name}.`,
        );
      }
    }

    if (newLayers.length > 0) {
      setLayers((prev) => [...prev, ...newLayers]);
      setError(null);
    }

    event.target.value = "";
  }

  function toggleLayer(id: string) {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    );
  }

  function removeLayer(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }

  function moveLayer(id: string, direction: "up" | "down") {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index < 0) return prev;
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  }

  function project([x, y]: Position) {
    const width = 960;
    const height = 560;
    const padding = 48;

    if (!bounds) {
      return { x: width / 2, y: height / 2 };
    }

    const spanX = bounds.maxX - bounds.minX || 1;
    const spanY = bounds.maxY - bounds.minY || 1;
    const scale = Math.min(
      (width - padding * 2) / spanX,
      (height - padding * 2) / spanY,
    );
    const drawWidth = spanX * scale;
    const drawHeight = spanY * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    return {
      x: offsetX + (x - bounds.minX) * scale,
      y: height - (offsetY + (y - bounds.minY) * scale),
    };
  }

  function pathForPoints(points: Position[]) {
    return points
      .filter(isPosition)
      .map((position, index) => {
        const point = project(position);
        return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      })
      .join(" ");
  }

  return (
    <section className="relative z-10 flex flex-col gap-8">
      <div className="rounded-[2rem] border border-white/12 bg-[#10251f]/85 p-6 shadow-2xl shadow-black/25 backdrop-blur md:p-8">
        <div className="inline-flex rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-100">
          GeoJSON Studio
        </div>
        <h1 className="mt-6 max-w-xl text-4xl font-black tracking-[-0.04em] text-[#fff9e8] md:text-6xl">
          Stack multiple layers on one map.
        </h1>
        <p className="mt-5 text-base leading-8 text-[#d8e4cc] md:text-lg">
          Upload one or more GeoJSON files. Each becomes a colored layer you can
          toggle, reorder, or remove. All data stays in your browser.
        </p>

        <label className="mt-8 flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[#f2c66d]/55 bg-[#f2c66d]/10 px-6 py-10 text-center transition hover:border-[#f9de99] hover:bg-[#f2c66d]/16">
          <span className="text-lg font-bold text-[#fff9e8]">
            Choose one or more .geojson / .json files
          </span>
          <span className="mt-2 text-sm text-[#d8e4cc]">
            Each file becomes its own map layer.
          </span>
          <input
            className="sr-only"
            type="file"
            multiple
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={handleFileChange}
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/12 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#f2c66d]">
            Layers ({layers.length})
          </h3>

          <div className="mt-3 flex flex-col gap-2">
            {[...layers].reverse().map((layer, reverseIndex) => {
              const realIndex = layers.length - 1 - reverseIndex;
              const shapes = featuresFromGeoJson(layer.data).flatMap((f) =>
                shapesFromGeometry(f.geometry),
              );
              return (
                <div
                  key={layer.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <button
                    className={`h-5 w-5 shrink-0 rounded-full border-2 transition ${layer.visible ? "border-white/60" : "border-white/20"}`}
                    style={{
                      backgroundColor: layer.visible ? layer.color : "transparent",
                    }}
                    onClick={() => toggleLayer(layer.id)}
                    aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#fff9e8]">
                      {layer.name}
                    </div>
                    <div className="text-xs text-[#d8e4cc]">
                      {shapes.length} shape{shapes.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      className="rounded-lg px-1.5 py-1 text-xs text-[#d8e4cc] transition hover:text-[#fff9e8]"
                      onClick={() => moveLayer(layer.id, "up")}
                      disabled={realIndex === 0}
                      aria-label="Move layer up"
                    >
                      ↑
                    </button>
                    <button
                      className="rounded-lg px-1.5 py-1 text-xs text-[#d8e4cc] transition hover:text-[#fff9e8]"
                      onClick={() => moveLayer(layer.id, "down")}
                      disabled={realIndex === layers.length - 1}
                      aria-label="Move layer down"
                    >
                      ↓
                    </button>
                    <button
                      className="rounded-lg px-1.5 py-1 text-xs text-red-300/70 transition hover:text-red-200"
                      onClick={() => removeLayer(layer.id)}
                      aria-label={`Remove ${layer.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Layers" value={layers.length.toString()} />
          <StatCard label="Visible" value={visibleLayers.length.toString()} />
          <StatCard label="Features" value={totalFeatures.toString()} />
          <StatCard label="Shapes" value={totalShapes.toString()} />
        </div>

        {bounds && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-[#d8e4cc]">
            Bounds: {formatNumber(bounds.minX)}, {formatNumber(bounds.minY)} — {formatNumber(bounds.maxX)}, {formatNumber(bounds.maxY)}
          </div>
        )}
      </div>

      <div className="rounded-[2rem] border border-white/12 bg-[#f6efd9] p-3 shadow-2xl shadow-black/25">
        <div className="relative overflow-hidden rounded-[1.5rem] bg-[#17372f]">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(#f6efd9_1px,transparent_1px),linear-gradient(90deg,#f6efd9_1px,transparent_1px)] [background-size:42px_42px]" />
          <svg
            className="relative h-full min-h-[360px] w-full"
            viewBox="0 0 960 560"
            role="img"
            aria-label="GeoJSON layers preview"
          >
            <rect width="960" height="560" fill="transparent" />

            {bounds ? (
              allShapes.map((shape, index) => {
                if (shape.kind === "point") {
                  const point = project(shape.point);
                  return (
                    <circle
                      key={`point-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="8"
                      fill={shape.color}
                      stroke="#fff9e8"
                      strokeWidth="3"
                    />
                  );
                }

                if (shape.kind === "line") {
                  return (
                    <path
                      key={`line-${index}`}
                      d={pathForPoints(shape.points)}
                      fill="none"
                      stroke={shape.color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="6"
                    />
                  );
                }

                return shape.rings.map((ring, ringIndex) => (
                  <path
                    key={`polygon-${index}-${ringIndex}`}
                    d={`${pathForPoints(ring)} Z`}
                    fill={ringIndex === 0 ? hexToRgba(shape.color, 0.35) : "#17372f"}
                    stroke={shape.color}
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                ));
              })
            ) : (
              <text
                x="480"
                y="280"
                fill="#fff9e8"
                fontSize="24"
                fontWeight="700"
                textAnchor="middle"
              >
                No drawable coordinates found
              </text>
            )}
          </svg>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/12 bg-[#10251f]/78 p-6 shadow-xl shadow-black/20 backdrop-blur">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.03em] text-[#fff9e8]">
              Data summary
            </h2>
            <p className="mt-2 text-sm text-[#d8e4cc]">
              Review geometry types and the first few feature properties across
              all visible layers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {layerData.map(({ layer, features }) => {
              const counts = features.reduce<Record<string, number>>((acc, f) => {
                const type = f.geometry?.type ?? "No geometry";
                acc[type] = (acc[type] ?? 0) + 1;
                return acc;
              }, {});
              return (
                <div key={layer.id} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: layer.color }}
                  />
                  <span className="text-sm font-semibold text-[#fff9e8]">
                    {layer.name}
                  </span>
                  {Object.entries(counts).map(([type, count]) => (
                    <span
                      key={`${layer.id}-${type}`}
                      className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-xs text-[#d8e4cc]"
                    >
                      {type}: {count}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {layerData.flatMap(({ layer, features }) =>
            features.slice(0, 3).map((feature, index) => {
              const properties = Object.entries(feature.properties ?? {}).slice(0, 4);

              return (
                <article
                  key={`${layer.id}-${feature.geometry?.type ?? "feature"}-${index}`}
                  className="rounded-2xl border border-white/10 bg-white/8 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#f2c66d]">
                      {layer.name}
                    </span>
                  </div>
                  <div className="mt-2 text-lg font-black text-[#fff9e8]">
                    {feature.geometry?.type ?? "No geometry"}
                  </div>
                  <dl className="mt-4 space-y-2 text-sm text-[#d8e4cc]">
                    {properties.length > 0 ? (
                      properties.map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-4">
                          <dt className="font-semibold text-[#fff9e8]">{key}</dt>
                          <dd className="truncate text-right">
                            {stringifyProperty(value)}
                          </dd>
                        </div>
                      ))
                    ) : (
                      <div>No properties</div>
                    )}
                  </dl>
                </article>
              );
            }),
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/8 p-4">
      <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#f2c66d]">
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-black text-[#fff9e8]" title={value}>
        {value}
      </div>
    </div>
  );
}
