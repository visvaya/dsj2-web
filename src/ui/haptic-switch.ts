/**
 * A stand-in for vibration in Safari on iOS, which has none. Safari gives a short tap of the phone's own when a
 * system switch (a checkbox with the `switch` attribute) is toggled, also when its label is clicked from a
 * script. A hidden switch is kept in the page and toggled once per tap.
 *
 * Whether the tap is felt depends on the phone and its settings; nothing in the page can tell. The game works
 * the same without it.
 */
export interface HapticSwitch {
  tap: () => void;
  remove: () => void;
}

/** Whether the browser knows system switches, which is where the tap comes from. */
export function hapticSwitchSupported(doc: Document = document): boolean {
  return "switch" in doc.createElement("input");
}

export function createHapticSwitch(doc: Document = document): HapticSwitch | null {
  if (!hapticSwitchSupported(doc)) return null;
  const label = doc.createElement("label");
  const input = doc.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  // Out of sight and out of the reach of the keyboard and of assistive technology.
  label.hidden = true;
  label.setAttribute("aria-hidden", "true");
  label.append(input);
  doc.body.append(label);
  return {
    tap: () => label.click(),
    remove: () => label.remove(),
  };
}
