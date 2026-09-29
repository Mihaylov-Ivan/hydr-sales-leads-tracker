import { redirect } from "next/navigation";

/** Legacy combined board — split into /eu and /rnd. */
export default function EuRndRedirectPage() {
  redirect("/eu");
}
