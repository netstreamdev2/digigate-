import { redirect } from "next/navigation";

/** The front door. Sign-in is handled before this, and the control room shows each person the sites they look after. */
export default function HomePage() {
  redirect("/control-room");
}
