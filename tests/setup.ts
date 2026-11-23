import { beforeEach } from "vite-plus/test";

/** Native Worker bindings for Node unit tests; never connect to Cloudflare. */
import { env as workerEnv } from "./fixtures/worker-bindings";

export function setWorkerEnv(values: Record<string, string | undefined> = {}): void {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
  Object.assign(workerEnv, values);
}

beforeEach(() => setWorkerEnv());
