import { Icon } from "./icon";

/** In or Out, in the same colours as the figure tiles: green coming in, purple going out. Words and icon too, never colour alone. */
export function DirectionChip({ direction }: { direction: "in" | "out" }) {
  const entering = direction === "in";
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-xs font-semibold ${entering ? "bg-clear-soft text-clear" : "bg-exit-soft text-exit"}`}>
      <Icon name={entering ? "entry" : "exit"} className="size-4" />
      {entering ? "In" : "Out"}
    </span>
  );
}
