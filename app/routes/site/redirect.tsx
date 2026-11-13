import { redirect } from "react-router";

/** Arabic is the default language for visitors in Algeria. */
export function loader() {
  return redirect("/ar");
}

export default function Redirect() {
  return null;
}
