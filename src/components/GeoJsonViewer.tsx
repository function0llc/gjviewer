"use client";

import { ChangeEvent, useMemo, useState } from "react";
import * as turf from "@turf/turf";

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

function clipFeatures(
  features: Feature[],
  clipBoundary: GeoJson | null,
): { clipped: Feature[]; clippedCount: number; originalCount: number } {
  if (!clipBoundary) {
    return { clipped: features, clippedCount: features.length, originalCount: features.length };
  }

  const clipFeaturesList = featuresFromGeoJson(clipBoundary);
  const clipPolygons = clipFeaturesList.filter(
    (f) =>
      f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );

  if (clipPolygons.length === 0) {
    return { clipped: features, clippedCount: features.length, originalCount: features.length };
  }

  const result: Feature[] = [];

  for (const feature of features) {
    if (!feature.geometry) continue;

    try {
      if (feature.geometry.type === "Point" || feature.geometry.type === "MultiPoint") {
        for (const clipFeat of clipPolygons) {
          if (turf.booleanPointInPolygon(feature as unknown as Parameters<typeof turf.booleanPointInPolygon>[0], clipFeat as unknown as Parameters<typeof turf.booleanPointInPolygon>[1])) {
            result.push(feature);
            break;
          }
        }
      } else if (
        feature.geometry.type === "Polygon" ||
        feature.geometry.type === "MultiPolygon" ||
        feature.geometry.type === "LineString" ||
        feature.geometry.type === "MultiLineString"
      ) {
        let anyIntersected = false;
        const clippedGeometries: Geometry[] = [];

        for (const clipFeat of clipPolygons) {
          try {
            const intersected = turf.intersect(feature as unknown as Parameters<typeof turf.intersect>[0], clipFeat as unknown as Parameters<typeof turf.intersect>[1]);
            if (intersected && intersected.geometry) {
              anyIntersected = true;
              clippedGeometries.push(intersected.geometry as Geometry);
            }
          } catch {
            // Skip features that can't be intersected
          }
        }

        if (anyIntersected) {
          if (clippedGeometries.length === 1) {
            result.push({
              ...feature,
              geometry: clippedGeometries[0],
            });
          } else if (clippedGeometries.length > 1) {
            result.push({
              ...feature,
              geometry: {
                type: "GeometryCollection",
                geometries: clippedGeometries,
              },
            });
          } else {
            result.push(feature);
          }
        }
      } else if (feature.geometry.type === "GeometryCollection") {
        const clippedParts: Geometry[] = [];
        for (const geom of feature.geometry.geometries) {
          const singleFeature: Feature = {
            type: "Feature",
            geometry: geom,
            properties: feature.properties,
          };
          const subResult = clipFeatures([singleFeature], clipBoundary);
          if (subResult.clipped.length > 0) {
            clippedParts.push(subResult.clipped[0].geometry!);
          }
        }
        if (clippedParts.length > 0) {
          result.push({
            ...feature,
            geometry: {
              type: "GeometryCollection",
              geometries: clippedParts,
            },
          });
        }
      }
    } catch {
      // If clipping fails, skip the feature
    }
  }

  return { clipped: result, clippedCount: result.length, originalCount: features.length };
}

export function GeoJsonViewer() {
  const [geoJson, setGeoJson] = useState<GeoJson>(SAMPLE_GEOJSON);
  const [fileName, setFileName] = useState("Sample data");
  const [error, setError] = useState<string | null>(null);

  const [clipGeoJson, setClipGeoJson] = useState<GeoJson | null>(null);
  const [clipFileName, setClipFileName] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);

  const features = useMemo(() => featuresFromGeoJson(geoJson), [geoJson]);

  const { clipped, clippedCount, originalCount } = useMemo(
    () => clipFeatures(features, clipGeoJson),
    [features, clipGeoJson],
  );

  const shapes = useMemo(
    () => clipped.flatMap((feature) => shapesFromGeometry(feature.geometry)),
    [clipped],
  );
  const bounds = useMemo(() => getBounds(shapes), [shapes]);

  const clipShapes = useMemo(
    () => (clipGeoJson ? featuresFromGeoJson(clipGeoJson).flatMap((f) => shapesFromGeometry(f.geometry)) : []),
    [clipGeoJson],
  );

  const geometryCounts = useMemo(() => {
    return clipped.reduce<Record<string, number>>((counts, feature) => {
      const type = feature.geometry?.type ?? "No geometry";
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});
  }, [clipped]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (!isGeoJson(parsed)) {
        throw new Error("The selected file is not valid GeoJSON.");
      }

      setGeoJson(parsed);
      setFileName(file.name);
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not read the selected file.",
      );
    }
  }

  async function handleClipFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (!isGeoJson(parsed)) {
        throw new Error("The selected file is not valid GeoJSON.");
      }

      const clipFeatures = featuresFromGeoJson(parsed);
      const hasPolygons = clipFeatures.some(
        (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
      );

      if (!hasPolygons) {
        throw new Error("Clipping boundary must contain at least one Polygon or MultiPolygon geometry.");
      }

      setClipGeoJson(parsed);
      setClipFileName(file.name);
      setClipError(null);
    } catch (caughtError) {
      setClipError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not read the selected file.",
      );
    }
  }

  function clearClipBoundary() {
    setClipGeoJson(null);
    setClipFileName(null);
    setClipError(null);
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

  function projectClip([x, y]: Position) {
    const width = 960;
    const height = 560;
    const padding = 48;

    const allBounds = getBounds([...shapes, ...clipShapes]);
    const effectiveBounds = allBounds ?? bounds;

    if (!effectiveBounds) {
      return { x: width / 2, y: height / 2 };
    }

    const spanX = effectiveBounds.maxX - effectiveBounds.minX || 1;
    const spanY = effectiveBounds.maxY - effectiveBounds.minY || 1;
    const scale = Math.min(
      (width - padding * 2) / spanX,
      (height - padding * 2) / spanY,
    );
    const drawWidth = spanX * scale;
    const drawHeight = spanY * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    return {
      x: offsetX + (x - effectiveBounds.minX) * scale,
      y: height - (offsetY + (y - effectiveBounds.minY) * scale),
    };
  }

  function pathForPoints(points: Position[], projector: (p: Position) => { x: number; y: number }) {
    return points
      .filter(isPosition)
      .map((position, index) => {
        const point = projector(position);
        return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      })
      .join(" ");
  }

  return (
    <section className="relative z-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[2rem] border border-white/12 bg-[#10251f]/85 p-6 shadow-2xl shadow-black/25 backdrop-blur md:p-8">
        <div className="inline-flex rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-100">
          GeoJSON Studio
        </div>
        <h1 className="mt-6 max-w-xl text-4xl font-black tracking-[-0.04em] text-[#fff9e8] md:text-6xl">
          Upload a file and see your map take shape.
        </h1>
        <p className="mt-5 text-base leading-8 text-[#d8e4cc] md:text-lg">
          Drop in a GeoJSON FeatureCollection, feature, or geometry. The viewer
          validates the file in your browser, draws the shapes, and summarizes
          the contents without sending your data anywhere.
        </p>

        <label className="mt-8 flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[#f2c66d]/55 bg-[#f2c66d]/10 px-6 py-10 text-center transition hover:border-[#f9de99] hover:bg-[#f2c66d]/16">
          <span className="text-lg font-bold text-[#fff9e8]">
            Choose a .geojson or .json file
          </span>
          <span className="mt-2 text-sm text-[#d8e4cc]">
            Points, lines, polygons, and geometry collections are supported.
          </span>
          <input
            className="sr-only"
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={handleFileChange}
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/12 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#f2c66d]">
            Clipping Boundary
          </h3>
          <p className="mt-1 text-sm text-[#d8e4cc]">
            Upload a polygon GeoJSON to clip the main data to its bounds.
          </p>

          {clipFileName ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="flex-1 truncate text-sm font-semibold text-[#fff9e8]">
                {clipFileName}
              </span>
              <button
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-[#fff9e8] transition hover:bg-white/20"
                onClick={clearClipBoundary}
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-4 text-center transition hover:border-white/25 hover:bg-white/8">
              <span className="text-sm font-medium text-[#d8e4cc]">
                Upload clipping boundary
              </span>
              <input
                className="sr-only"
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                onChange={handleClipFileChange}
              />
            </label>
          )}

          {clipError ? (
            <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/12 px-3 py-2 text-xs text-red-100">
              {clipError}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="File" value={fileName} />
          <StatCard label="Features" value={clipped.length.toString()} />
          <StatCard label="Shapes" value={shapes.length.toString()} />
          <StatCard
            label="Bounds"
            value={bounds ? `${formatNumber(bounds.minX)}, ${formatNumber(bounds.minY)}` : "-"}
          />
        </div>

        {clipGeoJson && (
          <div className="mt-3 rounded-xl border border-[#8b6fdf]/30 bg-[#8b6fdf]/10 px-4 py-2 text-sm text-[#d8c6f5]">
            Clipped {clippedCount} of {originalCount} features to boundary.
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
            aria-label="Uploaded GeoJSON preview"
          >
            <rect width="960" height="560" fill="transparent" />

            {clipShapes.map((shape, index) => {
              if (shape.kind === "polygon") {
                return shape.rings.map((ring, ringIndex) => (
                  <path
                    key={`clip-${index}-${ringIndex}`}
                    d={pathForPoints(ring, projectClip)}
                    fill="rgba(139, 111, 223, 0.08)"
                    stroke="#8b6fdf"
                    strokeDasharray="8 4"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                ));
              }
              return null;
            })}

            {bounds ? (
              shapes.map((shape, index) => {
                if (shape.kind === "point") {
                  const point = project(shape.point);
                  return (
                    <circle
                      key={`point-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="8"
                      fill="#f2c66d"
                      stroke="#fff9e8"
                      strokeWidth="3"
                    />
                  );
                }

                if (shape.kind === "line") {
                  return (
                    <path
                      key={`line-${index}`}
                      d={pathForPoints(shape.points, project)}
                      fill="none"
                      stroke="#f2c66d"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="6"
                    />
                  );
                }

                return shape.rings.map((ring, ringIndex) => (
                  <path
                    key={`polygon-${index}-${ringIndex}`}
                    d={`${pathForPoints(ring, project)} Z`}
                    fill={ringIndex === 0 ? "#68b98466" : "#17372f"}
                    stroke="#9fe7b4"
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

      <div className="rounded-[2rem] border border-white/12 bg-[#10251f]/78 p-6 shadow-xl shadow-black/20 backdrop-blur lg:col-span-2">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.03em] text-[#fff9e8]">
              Data summary
            </h2>
            <p className="mt-2 text-sm text-[#d8e4cc]">
              Review geometry types and the first few feature properties before
              you share or publish the map.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(geometryCounts).map(([type, count]) => (
              <span
                key={type}
                className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-sm font-semibold text-emerald-50"
              >
                {type}: {count}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {clipped.slice(0, 6).map((feature, index) => {
            const properties = Object.entries(feature.properties ?? {}).slice(0, 4);

            return (
              <article
                key={`${feature.geometry?.type ?? "feature"}-${index}`}
                className="rounded-2xl border border-white/10 bg-white/8 p-4"
              >
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#f2c66d]">
                  Feature {index + 1}
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
          })}
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
