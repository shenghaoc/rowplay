import { WebGPURenderer } from "three/webgpu";
import type { RenderQuality } from "./replayRenderer";
import { CourseRenderer3D } from "./renderer3d";
import type { Sport } from "../types";

export class CourseRenderer3DWebGPU extends CourseRenderer3D {
  constructor(host: HTMLElement, quality: RenderQuality = "medium", sport: Sport = "rower") {
    super(host, quality, sport, { backend: "webgpu", WebGPURenderer });
  }
}
