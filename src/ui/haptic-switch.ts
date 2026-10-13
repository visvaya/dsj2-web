/**
 * A stand-in for vibration in Safari on iOS, which has none. Safari gives a short tap of the phone's own when a
 * system switch (a checkbox with the `switch` attribute) is toggled, also when its label is clicked from a
 * script. A hidden switch is kept in the page and toggled once per tap.
 *
 * Nothing in the page can tell whether the tap is felt: it depends on the phone, its settings and the version
 * of the browser, and other browsers simply ignore the switch. The game works the same without it.
 */
export interface HapticSwitch {
  tap: () => void;
  remove: () => void;
}

export function createHapticSwitch(doc: Document = document): HapticSwitch {
  const label = doc.createElement("label");
  const input = doc.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  // The switch keeps the browser's own look, whatever the page's styles say: the tap comes with that look.
  input.style.all = "initial";
  input.style.appearance = "auto";
  // Out of sight and out of the reach of the keyboard and of assistive technology.
  input.style.display = "none";
  label.style.display = "none";
  label.setAttribute("aria-hidden", "true");
  label.append(input);
  doc.body.append(label);
  return {
    tap: () => label.click(),
    remove: () => label.remove(),
  };
}
