/** How a file reached the player: through the phone's share sheet, as a download, or not at all. */
export type HandOver = "shared" | "downloaded" | "cancelled";

/** The parts of the browser this needs; the real ones in the game, stand-ins in tests. */
interface FileOutlets {
  share: ((data: { files: File[]; title: string }) => Promise<void>) | undefined;
  canShare: ((data: { files: File[] }) => boolean) | undefined;
  download: (file: File) => void;
}

const DOWNLOAD_URL_LIFETIME_MS = 60_000;

/** Saves a file through a link the page clicks itself, as a download. */
function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  // The download has its own copy once it has started; a slow save dialog gets a minute to start it.
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}

const browserOutlets = (): FileOutlets => ({
  share: typeof navigator.share === "function" ? (data) => navigator.share(data) : undefined,
  canShare: typeof navigator.canShare === "function" ? (data) => navigator.canShare(data) : undefined,
  download,
});

/**
 * Gives the player a file: on a phone (`preferShare`) through the share sheet, where the browser can share files,
 * so it can go to another app or to the phone's files; otherwise, and on a computer, as a download.
 */
export async function handOverFile(
  file: File,
  title: string,
  preferShare: boolean,
  outlets: FileOutlets = browserOutlets(),
): Promise<HandOver> {
  const { share, canShare } = outlets;
  if (preferShare && share && canShare?.({ files: [file] }) === true) {
    try {
      await share({ files: [file], title });
      return "shared";
    } catch (error) {
      // Closing the sheet is the player's choice; any other failure falls back to a download.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  outlets.download(file);
  return "downloaded";
}
