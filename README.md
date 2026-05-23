# GeoJSON Studio

A browser-based GeoJSON viewer that lets you upload, preview, and manage multiple data layers on a single interactive map.

## Features

- **Multi-layer support** — upload one or more `.geojson` / `.json` files, each becomes its own colored layer
- **Layer controls** — toggle visibility, reorder layers, or remove them individually
- **SVG map preview** — points, lines, polygons, and geometry collections rendered with a unified viewport
- **Client-side only** — files are parsed and validated in your browser; no data is sent to any server
- **Data summary** — per-layer geometry counts, feature properties, and bounding-box info at a glance

## Tech Stack

| Technology   | Version  |
| ------------ | -------- |
| Next.js      | 15.5.18  |
| React        | 18.3.1   |
| TypeScript   | 5.9.x    |
| Tailwind CSS | 3.4.17   |
| Bun          | Latest   |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)

### Install Dependencies

```bash
bun install
```

### Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
bun build
bun start
```

### Type Checking & Linting

```bash
bun typecheck
bun lint
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout + metadata
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
└── components/
    └── GeoJsonViewer.tsx   # Upload, layer management, and SVG renderer
```

## Supported GeoJSON

| Geometry Type        | Status |
| -------------------- | ------ |
| Point                | ✅     |
| MultiPoint           | ✅     |
| LineString           | ✅     |
| MultiLineString      | ✅     |
| Polygon              | ✅     |
| MultiPolygon         | ✅     |
| GeometryCollection   | ✅     |
| Feature              | ✅     |
| FeatureCollection    | ✅     |

## Deployment

This project is configured with `output: "standalone"` for OpenNext compatibility and deploys to the Kilo builder platform.

## License

MIT
