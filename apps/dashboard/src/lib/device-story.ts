import { duration } from "./format";

/*
 * What a handheld reported about itself, in the words a control room uses. A "back" entry (switched on, signal back)
 * says how long the matching trouble lasted, found by looking further back in the story. Entries are newest first.
 */

export type StoryTone = "trouble" | "back" | "neutral";

export type StoryLine = { at: string; title: string; detail: string | null; tone: StoryTone };

type Entry = { at: string; kind: string; battery: number | null; reason: string | null; actor: string | null };

/** Below this the handheld most likely went off because its battery ran flat. */
const FLAT_BATTERY = 10;

const STARTS: Readonly<Record<string, readonly string[]>> = {
  switched_on: ["switched_off", "went_off"],
  airplane_off: ["airplane_on"],
  data_on: ["data_off"],
  signal_back: ["no_signal"],
  sim_back: ["sim_removed"],
};

const CLOSED_BECAUSE: Readonly<Record<string, string>> = {
  by_user: "Closed by someone on the handheld",
  crash: "It crashed",
  not_responding: "It stopped responding",
  low_memory: "The handheld ran out of memory",
  system: "Android stopped it",
};

const battery = (entry: Entry) => (entry.battery === null ? null : `Battery ${entry.battery}%`);

function words(entry: Entry): { title: string; detail: string | null; tone: StoryTone } {
  switch (entry.kind) {
    case "switched_off":
      return { title: "Switched off", detail: battery(entry), tone: "trouble" };
    case "went_off":
      return {
        title: "Went off without shutting down",
        detail:
          entry.battery !== null && entry.battery <= FLAT_BATTERY
            ? `Battery was ${entry.battery}%: it most likely went flat`
            : entry.battery !== null
              ? `Battery was ${entry.battery}%: held down or dropped`
              : null,
        tone: "trouble",
      };
    case "switched_on":
      return { title: "Switched on", detail: battery(entry), tone: "back" };
    case "airplane_on":
      return { title: "Airplane mode switched on", detail: "No calls, data or GPS until it's off", tone: "trouble" };
    case "airplane_off":
      return { title: "Airplane mode off", detail: null, tone: "back" };
    case "data_off":
      return { title: "Mobile data switched off", detail: "Nothing can sync over the SIM", tone: "trouble" };
    case "data_on":
      return { title: "Mobile data back on", detail: null, tone: "back" };
    case "no_signal":
      return { title: "No signal", detail: "Still works offline; its checks arrive when it's back", tone: "trouble" };
    case "signal_back":
      return { title: "Signal back", detail: null, tone: "back" };
    case "sim_removed":
      return { title: "SIM card taken out", detail: null, tone: "trouble" };
    case "sim_back":
      return { title: "SIM card back in", detail: null, tone: "back" };
    case "app_closed":
      return { title: "DigiGate closed", detail: (entry.reason && CLOSED_BECAUSE[entry.reason]) ?? null, tone: entry.reason === "by_user" ? "trouble" : "neutral" };
    case "released":
      return { title: "Released from DigiGate", detail: entry.actor ? `By ${entry.actor}. Its other apps and hotspot are back.` : "Its other apps and hotspot are back.", tone: "trouble" };
    case "release_failed":
      return { title: "A release didn't go through", detail: entry.actor ? `Tried by ${entry.actor}. It's still locked to DigiGate.` : "It's still locked to DigiGate.", tone: "neutral" };
    default:
      return { title: "Something else happened", detail: null, tone: "neutral" };
  }
}

export function storyLines(entries: readonly Entry[]): StoryLine[] {
  return entries.map((entry, index) => {
    const line = words(entry);
    const starts = STARTS[entry.kind];
    const start = starts ? entries.slice(index + 1).find((older) => starts.includes(older.kind)) : undefined;
    const lasted = start ? `After ${duration(start.at, entry.at).replace(/^Under/, "under")}` : null;
    return { at: entry.at, title: line.title, detail: [lasted, line.detail].filter(Boolean).join(" · ") || null, tone: line.tone };
  });
}
