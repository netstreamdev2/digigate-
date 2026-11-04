import "server-only";

// Finding a site's address as it's typed, from OpenStreetMap through Photon, which is made for search-as-you-type
// (OpenStreetMap's own search forbids it). Only the words typed are sent, never anything about people.

const PHOTON_URL = "https://photon.komoot.io/api/";
// South Africa, as west, south, east, north, so results stay local.
const SOUTH_AFRICA_BOX = "16.3,-35.0,33.0,-22.1";
const RESULTS = 6;
// The public server can be slow from South Africa, and the box says "Searching…" meanwhile.
const WAIT_MS = 10_000;

export type PlaceChoice = { id: string; name: string; address: string; latitude: number; longitude: number };

type PhotonProperties = {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  city?: string;
  county?: string;
  postcode?: string;
};

type PhotonFeature = { properties?: PhotonProperties; geometry?: { coordinates?: unknown } };

const isFeatureList = (value: unknown): value is { features: PhotonFeature[] } =>
  typeof value === "object" && value !== null && Array.isArray((value as { features?: unknown }).features);

function toChoice(feature: PhotonFeature): PlaceChoice | null {
  const place = feature.properties ?? {};
  const [longitude, latitude] = Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates : [];
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  const street = [place.housenumber, place.street].filter(Boolean).join(" ");
  const name = place.name ?? street;
  if (!name) return null;
  // Ward names ("eThekwini Ward 36") mean nothing on an address, so the suburb, town and postcode stand in.
  const address = [place.name && place.name !== street ? place.name : null, street || null, place.locality, place.city ?? place.county, place.postcode]
    .filter(Boolean)
    .join(", ");
  return { id: `${place.osm_type ?? ""}${place.osm_id ?? `${latitude},${longitude}`}`, name, address, latitude, longitude };
}

/** Places and streets matching what was typed, nearest the start of the list first. Throws when the service can't be reached. */
export async function findPlaces(search: string): Promise<PlaceChoice[]> {
  const url = new URL(PHOTON_URL);
  url.search = new URLSearchParams({ q: search, limit: String(RESULTS), bbox: SOUTH_AFRICA_BOX, lang: "en" }).toString();
  const response = await fetch(url, { headers: { "User-Agent": "DigiGate site setup" }, signal: AbortSignal.timeout(WAIT_MS), cache: "no-store" });
  if (!response.ok) throw new Error(`Place search answered ${response.status}`);
  const body: unknown = await response.json();
  if (!isFeatureList(body)) throw new Error("Place search sent something unexpected");
  const seen = new Set<string>();
  return body.features.flatMap((feature) => {
    const choice = toChoice(feature);
    if (!choice || seen.has(choice.address)) return [];
    seen.add(choice.address);
    return [choice];
  });
}
