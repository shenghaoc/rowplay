import { WebGPURenderer } from "three/webgpu";
import type { RenderQuality } from "./replayRenderer";
import { CourseRenderer3D, type Renderer3DOptions } from "./renderer3d";
import type { Sport } from "../types";

const WEBGPU_RENDERER_OPTIONS = {
  backend: "webgpu" as const,
  WebGPURenderer,
};

export class CourseRenderer3DWebGPU extends CourseRenderer3D {
  constructor(
    host: HTMLElement,
    quality: RenderQuality = "medium",
    sport: Sport = "rower",
    options: Renderer3DOptions = {},
  ) {
    super(host, quality, sport, { ...options, ...WEBGPU_RENDERER_OPTIONS });
  }
}
