"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

import { parseLocation } from "@/lib/access-points";

type Point = { latitude: number; longitude: number };

// South Africa as a whole, for a place with nothing to start from yet.
const COUNTRY = { latitude: -29.0, longitude: 24.5, zoom: 5 };
const NEAR_ZOOM = 16;
const PIN_ZOOM = 18;
const PIN_SIZE = 28;

const asText = ({ latitude, longitude }: Point) => `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

function pointOf(text: string): Point | null {
  const parsed = parseLocation(text);
  return parsed && parsed !== "invalid" ? parsed : null;
}

type Props = {
  /** As kept in the form: "latitude, longitude", or empty for none yet. */
  location: string;
  radiusM: number;
  onLocation: (next: string) => void;
  /** Where to start looking when nothing is set, such as the site an access point belongs to. */
  near?: Point | null;
};

/**
 * Where a place is, set on a map: click it, or drag the pin, and the geofence shows as a circle around it. "Use where I
 * am" takes the browser's own position, for someone standing at the gate. Maps are OpenStreetMap's.
 */
export function LocationMap({ location, radiusM, onLocation, near = null }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const pin = useRef<Leaflet.Marker | null>(null);
  const fence = useRef<Leaflet.Circle | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const report = useRef(onLocation);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    report.current = onLocation;
  }, [onLocation]);

  // The map is made once, in the browser only: Leaflet needs the page's window.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let cancelled = false;
    let resize: ResizeObserver | null = null;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !box.current) return;
      library.current = L;
      const start = pointOf(location) ?? near;
      const created = L.map(element, { zoomControl: true, attributionControl: true }).setView(
        start ? [start.latitude, start.longitude] : [COUNTRY.latitude, COUNTRY.longitude],
        pointOf(location) ? PIN_ZOOM : start ? NEAR_ZOOM : COUNTRY.zoom,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(created);
      created.on("click", (event: Leaflet.LeafletMouseEvent) => report.current(asText({ latitude: event.latlng.lat, longitude: event.latlng.lng })));
      map.current = created;
      // A map drawn inside a closed popup has no size until the popup opens.
      resize = new ResizeObserver(() => created.invalidateSize());
      resize.observe(element);
      setReady(true);
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      pin.current = null;
      fence.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- made once; later changes reach it through the effect below
  }, []);

  // The pin and the circle follow the form, however the location was set.
  useEffect(() => {
    const L = library.current;
    const created = map.current;
    if (!ready || !L || !created) return;
    const point = pointOf(location);
    if (!point) {
      pin.current?.remove();
      fence.current?.remove();
      pin.current = null;
      fence.current = null;
      return;
    }
    const at: Leaflet.LatLngExpression = [point.latitude, point.longitude];
    if (!pin.current) {
      pin.current = L.marker(at, {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({ className: "dg-map-pin", iconSize: [PIN_SIZE, PIN_SIZE], iconAnchor: [PIN_SIZE / 2, PIN_SIZE] }),
      }).addTo(created);
      pin.current.on("dragend", () => {
        const moved = pin.current?.getLatLng();
        if (moved) report.current(asText({ latitude: moved.lat, longitude: moved.lng }));
      });
      created.setView(at, Math.max(created.getZoom(), NEAR_ZOOM));
    } else {
      pin.current.setLatLng(at);
    }
    if (!fence.current) fence.current = L.circle(at, { radius: radiusM, className: "dg-map-fence", interactive: false }).addTo(created);
    else fence.current.setLatLng(at).setRadius(radiusM);
  }, [location, radiusM, ready]);

  const useWhereIAm = () => {
    if (!("geolocation" in navigator)) {
      setProblem("This browser can't tell where it is. Click the map instead.");
      return;
    }
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        report.current(asText(point));
        map.current?.setView([point.latitude, point.longitude], PIN_ZOOM);
        if (coords.accuracy > 30) setProblem(`That position is only good to about ${Math.round(coords.accuracy)} m. Drag the pin onto the gate if it's off.`);
      },
      () => {
        setLocating(false);
        setProblem("The browser wasn't allowed to say where it is. Click the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="h-72 w-full overflow-hidden rounded-md border border-border bg-surface-muted" role="application" aria-label="Map. Click where it is, or drag the pin." />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useWhereIAm}
          disabled={locating}
          className="rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border disabled:opacity-50"
        >
          {locating ? "Finding you…" : "Use where I am"}
        </button>
        {pointOf(location) ? (
          <button type="button" onClick={() => onLocation("")} className="text-xs font-semibold text-blocked hover:underline">
            Clear the location
          </button>
        ) : (
          <p className="text-xs text-ink-muted">Click the map where it is, then drag the pin to fine-tune.</p>
        )}
      </div>
      {problem ? <p className="text-xs text-warning">{problem}</p> : null}
    </div>
  );
}
