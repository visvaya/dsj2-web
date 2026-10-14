import { UI_TEXT } from "../text/ui-text";

/** The way the game is played: it decides what the instructions name. */
export type Steering = "mouse" | "touch" | "tilt";

interface Step {
  title: string;
  text: string;
}

/** How to play a jump, step by step, in the words of one way of steering. */
export function howToJump(steering: Steering): readonly Step[] {
  const texts = UI_TEXT.howTo.steps[steering];
  return UI_TEXT.howTo.stepTitles.map((title, index) => ({ title, text: texts[index] ?? "" }));
}
