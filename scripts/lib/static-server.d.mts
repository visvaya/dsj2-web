// Types of static-server.mjs for the browser tests, which are TypeScript.

export interface ServerFault {
  /** Path of the file that is answered wrongly, for example "/assets/index-abc.js". */
  path: string;
  /** "missing": a 404; "corrupt": the file with one byte added. */
  kind: "missing" | "corrupt";
}

export interface ServedRequest {
  method: string;
  path: string;
}

export interface StaticServer {
  readonly origin: string;
  readonly port: number;
  /** Every request received so far, in order, also those that got no answer while offline. */
  readonly requests: readonly ServedRequest[];
  setRoot(root: string): void;
  setFaults(faults: readonly ServerFault[]): void;
  setOffline(offline: boolean): void;
  onRequest(listener: ((request: ServedRequest) => void) | null): void;
  close(): Promise<void>;
}

export function startStaticServer(options: { root: string; port?: number; host?: string }): Promise<StaticServer>;
