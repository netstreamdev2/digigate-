import { Icon, type IconName } from "./icon";
import { tileColour, type TileMeaning } from "./tile-colour";

export type Kpi = {
  label: string;
  value: string;
  icon: IconName;
  detail?: string;
  /** Sets the tile's colour: entries green, exits purple, problems red, warnings amber (components/tile-colour.ts). */
  meaning?: TileMeaning;
};

export function StatTile({ label, value, icon, detail, meaning = "neutral" }: Kpi) {
  const { style, chip } = tileColour(meaning);
  return (
    <div className="dg-glass dg-tile p-5" style={style}>
      <div className="flex items-center gap-3">
        <span className={`grid size-10 place-items-center rounded-pill shadow-glow ${chip}`}>
          <Icon name={icon} />
        </span>
        <p className="text-sm font-medium text-ink-muted">{label}</p>
      </div>
      <p className="mt-4 font-display text-4xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink-muted">{detail}</p> : null}
    </div>
  );
}
