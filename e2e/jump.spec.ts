import {
  BUILT_IN_HILL_ID,
  builtInHill,
  leaveJumpForHills,
  openHillList,
  openJumpFromStart,
  openMenu,
  storedSave,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { playUntilLanded } from "./support/jump";

test("a whole jump ends in a record that the hill list shows and a reload keeps", async ({ page, traits }) => {
  await openJumpFromStart(page, traits);

  const outcomes = await playUntilLanded(page, traits);
  const landed = outcomes.at(-1);
  expect(landed?.kind).toBe("landed");
  // The announcement reads the notes and the points with a decimal comma, like the distance.
  expect(landed?.announcement).toMatch(/Noty: (\d+,\d; ){4}\d+,\d\. Wynik: -?\d+,\d punktu\. Nowy rekord skoczni\./);

  // The list writes the same distance with a decimal point, as the picture does.
  const record = `rekord ${landed?.distance?.replace(",", ".") ?? ""} m`;
  await leaveJumpForHills(page, traits);
  await expect(builtInHill(page)).toContainText(record);
  expect(await storedSave(page)).toMatchObject({
    records: { [BUILT_IN_HILL_ID]: { distanceM: expect.any(Number), points: expect.any(Number) } },
  });

  await openMenu(page);
  await openHillList(page, traits);
  await expect(builtInHill(page)).toContainText(record);
});
