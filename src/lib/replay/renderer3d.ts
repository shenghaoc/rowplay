import * as THREE from 'three';
import type { ReplayRenderer, RenderState } from './renderer';
import { COLORS_DARK, COLORS_LIGHT } from './renderer';
import type { RenderQuality } from './replayRenderer';
import { fmtPace } from '../format';

const reducedMotionQuery =
	typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-reduced-motion: reduce)')
		: null;

function prefersReducedMotion(): boolean {
	return reducedMotionQuery?.matches ?? false;
}

function hex(color: string): number {
	return Number.parseInt(color.slice(1), 16);
}

function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

interface QualityConfig {
	dprCap: number;
	antialias: boolean;
	/** Plane segments per side (1 = flat, no wave displacement). */
	waterSegments: number;
	waves: boolean;
	shadows: boolean;
	/** Number of wake segments trailing each boat (0 = no wake). */
	wake: number;
}

const QUALITY: Record<RenderQuality, QualityConfig> = {
	low: { dprCap: 1, antialias: false, waterSegments: 1, waves: false, shadows: false, wake: 0 },
	medium: { dprCap: 2, antialias: true, waterSegments: 16, waves: true, shadows: false, wake: 16 },
	high: { dprCap: 2, antialias: true, waterSegments: 28, waves: true, shadows: true, wake: 28 }
};

function makeTextSprite(
	text: string,
	bg: string,
	fg: string,
	fontSize = 22
): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
	const pad = 10;
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d')!;
	ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
	const tw = ctx.measureText(text).width;
	canvas.width = Math.ceil(tw + pad * 2);
	canvas.height = fontSize + pad * 2;
	ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = fg;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, canvas.width / 2, canvas.height / 2);
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
	const sprite = new THREE.Sprite(material);
	const scale = 0.012;
	sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
	return { sprite, texture };
}

function updateTextSprite(
	sprite: THREE.Sprite,
	texture: THREE.CanvasTexture,
	text: string,
	bg: string,
	fg: string,
	fontSize = 22
): void {
	const pad = 10;
	const canvas = texture.image as HTMLCanvasElement;
	const ctx = canvas.getContext('2d')!;
	ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
	const tw = ctx.measureText(text).width;
	const targetWidth = Math.ceil(tw + pad * 2);
	const targetHeight = fontSize + pad * 2;
	if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
		canvas.width = targetWidth;
		canvas.height = targetHeight;
	}
	ctx.font = `600 ${fontSize}px "Source Code Pro", ui-monospace, monospace`;
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = fg;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, canvas.width / 2, canvas.height / 2);
	texture.needsUpdate = true;
	const scale = 0.012;
	sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
}

/** Animatable parts of a single scull, returned by `makeShell`. */
interface Shell {
	group: THREE.Group;
	rower: THREE.Group;
	oars: THREE.Group[]; // [port (-x), starboard (+x)]
}

/**
 * Low-poly single scull: long thin hull (capsule), a seated rower, and two oars
 * with blades. The hull, deck and oar blades carry `userData.accent` so the
 * per-boat accent colour (live `--live` / ghost `--ghost`) can be re-themed
 * without touching the rower (kit/skin) or oar shafts. Local +Z is the bow.
 */
function makeShell(accent: number, castShadow: boolean, opacity = 1): Shell {
	const group = new THREE.Group();
	const accentMat = () =>
		new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.1 });

	const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 3.0, 4, 8), accentMat());
	hull.rotation.x = Math.PI / 2; // capsule axis Y -> Z (travel)
	hull.scale.set(0.5, 0.42, 1); // narrow + low profile
	hull.position.y = 0.16;
	hull.userData.accent = true;
	hull.castShadow = castShadow;
	group.add(hull);

	const deck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 2.6), accentMat());
	deck.position.y = 0.3;
	deck.userData.accent = true;
	group.add(deck);

	// Rower (torso + head) in its own group so it can slide + lean per stroke.
	const rower = new THREE.Group();
	const torso = new THREE.Mesh(
		new THREE.BoxGeometry(0.34, 0.5, 0.3),
		new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8 })
	);
	torso.position.y = 0.5;
	torso.castShadow = castShadow;
	const head = new THREE.Mesh(
		new THREE.SphereGeometry(0.13, 8, 6),
		new THREE.MeshStandardMaterial({ color: 0xd8b48a, roughness: 0.7 })
	);
	head.position.y = 0.82;
	rower.add(torso, head);
	rower.position.z = -0.1;
	group.add(rower);

	// Oars: each a group pivoting about the boat centreline (rigger pin).
	const oars: THREE.Group[] = [];
	for (const side of [-1, 1]) {
		const oar = new THREE.Group();
		const shaft = new THREE.Mesh(
			new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6),
			new THREE.MeshStandardMaterial({ color: 0xe7eef0, roughness: 0.6 })
		);
		shaft.rotation.z = Math.PI / 2; // cylinder axis Y -> X
		shaft.position.x = side * 1.2;
		oar.add(shaft);
		const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.26), accentMat());
		blade.position.set(side * 2.4, -0.05, 0);
		blade.userData.accent = true;
		oar.add(blade);
		oar.position.y = 0.28;
		oar.userData.side = side;
		group.add(oar);
		oars.push(oar);
	}
	// A translucent shell reads instantly as the "ghost" vs the solid live boat.
	if (opacity < 1) {
		group.traverse((o) => {
			if (o instanceof THREE.Mesh && o.material instanceof THREE.Material) {
				o.material.transparent = true;
				o.material.opacity = opacity;
			}
		});
	}
	return { group, rower, oars };
}

/**
 * A fading foam trail of flat quads dropped along a boat's recent path. Each
 * segment owns its material so opacity can fade toward the tail.
 */
class WakeTrail {
	private segs: THREE.Mesh[] = [];
	private mats: THREE.MeshBasicMaterial[] = [];
	private hist: THREE.Vector3[] = [];

	constructor(scene: THREE.Scene, n: number, geo: THREE.PlaneGeometry) {
		for (let i = 0; i < n; i++) {
			const mat = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			const seg = new THREE.Mesh(geo, mat);
			seg.rotation.x = -Math.PI / 2;
			seg.position.y = 0.02;
			seg.visible = false;
			scene.add(seg);
			this.segs.push(seg);
			this.mats.push(mat);
		}
	}

	update(x: number, z: number): void {
		const n = this.segs.length;
		// Recycle the tail vector once at capacity — no per-frame allocation.
		const h = this.hist.length >= n ? this.hist.pop()! : new THREE.Vector3();
		h.set(x, 0.02, z);
		this.hist.unshift(h);
		for (let i = 0; i < n; i++) {
			const seg = this.segs[i];
			const h = this.hist[i];
			if (!h) {
				seg.visible = false;
				continue;
			}
			seg.visible = true;
			seg.position.set(h.x, 0.02, h.z);
			const f = 1 - i / n; // 1 at boat, 0 at tail
			this.mats[i].opacity = f * 0.5;
			const s = 0.5 + f * 1.1;
			seg.scale.set(s, s, s);
		}
	}

	reset(): void {
		this.hist.length = 0;
		for (const seg of this.segs) seg.visible = false;
	}

	dispose(): void {
		for (const m of this.mats) m.dispose();
	}
}

/**
 * WebGL course replay — lazy-loaded; mirrors 2D RenderState in a low-poly scene.
 * The athlete rows around a circular loop: one lap = 1 km (matching ErgData), so
 * longer pieces wrap multiple times. `three` is imported only in this module.
 */
export class CourseRenderer3D implements ReplayRenderer {
	private static readonly LOOP_METERS = 1000; // one lap = 1 km
	private readonly loopRadius = 30;
	private readonly ghostRadius = 26;

	private cfg: QualityConfig;
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private cameraInit = false;
	private w = 0;
	private h = 0;
	private waterPhase = 0;
	private lastWaterPhase = NaN;
	private strokePhase = 0;
	private lastLiveMeters = 0;
	private lastGhostMeters = 0;
	private reduceMotion = false;
	private lastReduceMotion = false;
	private theme: 'light' | 'dark' = 'light';

	private host: HTMLElement;
	private canvas: HTMLCanvasElement;
	private waterMesh!: THREE.Mesh;
	private liveBoat: THREE.Group; // outer: position + heading
	private liveShell: Shell; // inner: bob + roll + stroke
	private ghostGroup: THREE.Group; // outer: position + heading + visibility
	private ghostShell: Shell;
	private liveWake: WakeTrail | null = null;
	private ghostWake: WakeTrail | null = null;
	private liveLabel: THREE.Sprite;
	private liveLabelTex: THREE.CanvasTexture;
	private ghostLabel: THREE.Sprite | null = null;
	private ghostLabelTex: THREE.CanvasTexture | null = null;
	private lastLiveLabel = '';
	private lastGhostLabel = '';
	private chase = new THREE.Vector3();
	private lookAt = new THREE.Vector3();
	private disposables: THREE.Material[] = [];
	private geometries: THREE.BufferGeometry[] = [];
	private postMatMajor!: THREE.MeshStandardMaterial;
	private postMatMinor!: THREE.MeshStandardMaterial;
	private cellMatDark!: THREE.MeshStandardMaterial;
	private cellMatLight!: THREE.MeshStandardMaterial;

	constructor(host: HTMLElement, quality: RenderQuality = 'medium') {
		this.cfg = QUALITY[quality];
		// A canvas can only ever hold ONE context type for its lifetime, and the 2D
		// renderer locks the shared page canvas to '2d'. So the 3D renderer creates
		// and owns its own canvas (and removes it on destroy) — this also means a
		// fresh context every time, so destroy()'s loseContext() can't poison reuse.
		this.host = host;
		this.canvas = document.createElement('canvas');
		this.canvas.style.display = 'block';
		this.canvas.style.width = '100%';
		host.appendChild(this.canvas);
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: this.cfg.antialias,
			alpha: true
		});
		if (this.cfg.shadows) {
			this.renderer.shadowMap.enabled = true;
			this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		}
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 500);

		// Sky/ground hemisphere fill + a key sun give boats nicer shading than a
		// flat ambient. The sun casts shadows only at high quality.
		this.scene.add(new THREE.HemisphereLight(0xddeaf2, 0x4a5560, 0.85));
		const sun = new THREE.DirectionalLight(0xffffff, 0.8);
		sun.position.set(14, 26, 10);
		if (this.cfg.shadows) {
			sun.castShadow = true;
			sun.shadow.mapSize.set(1024, 1024);
			const c = sun.shadow.camera;
			c.near = 1;
			c.far = 90;
			c.left = c.bottom = -42;
			c.right = c.top = 42;
		}
		this.scene.add(sun);

		this.liveShell = makeShell(hex(COLORS_LIGHT.live), this.cfg.shadows);
		this.liveBoat = new THREE.Group();
		this.liveBoat.add(this.liveShell.group);
		// Ghost: translucent + no shadow so it reads as a phantom, clearly distinct
		// from the solid live boat.
		this.ghostShell = makeShell(hex(COLORS_LIGHT.ghost), false, 0.45);
		this.ghostGroup = new THREE.Group();
		this.ghostGroup.visible = false;
		this.ghostGroup.add(this.ghostShell.group);
		this.scene.add(this.liveBoat, this.ghostGroup);

		const liveSpr = makeTextSprite('', COLORS_LIGHT.labelBg, COLORS_LIGHT.live);
		this.liveLabel = liveSpr.sprite;
		this.liveLabelTex = liveSpr.texture;
		this.scene.add(this.liveLabel);

		this.buildStaticScene();

		if (this.cfg.wake > 0) {
			const wakeGeo = this.track(new THREE.PlaneGeometry(0.9, 0.9));
			this.liveWake = new WakeTrail(this.scene, this.cfg.wake, wakeGeo);
			this.ghostWake = new WakeTrail(this.scene, this.cfg.wake, wakeGeo);
		}
	}

	private track<T extends THREE.BufferGeometry>(g: T): T {
		this.geometries.push(g);
		return g;
	}

	private mat<T extends THREE.Material>(m: T): T {
		this.disposables.push(m);
		return m;
	}

	private loopAngle(meters: number): number {
		return (meters / CourseRenderer3D.LOOP_METERS) * Math.PI * 2;
	}

	private buildStaticScene(): void {
		const seg = this.cfg.waterSegments;
		const waterGeo = this.track(new THREE.PlaneGeometry(140, 140, seg, seg));
		const waterMat = this.mat(
			new THREE.MeshStandardMaterial({
				color: 0x8aa2ac,
				transparent: true,
				opacity: 0.4,
				roughness: 0.85,
				metalness: 0.05
			})
		);
		waterMat.name = 'water';
		const water = new THREE.Mesh(waterGeo, waterMat);
		water.rotation.x = -Math.PI / 2;
		water.position.y = -0.05;
		water.name = 'water';
		water.receiveShadow = this.cfg.shadows;
		this.waterMesh = water;
		this.scene.add(water);

		const innerR = this.ghostRadius - 4;
		const outerR = this.loopRadius + 4;
		const laneGeo = this.track(new THREE.RingGeometry(innerR, outerR, 72));
		const laneMat = this.mat(
			new THREE.MeshStandardMaterial({
				color: hex(COLORS_LIGHT.courseFill),
				roughness: 0.85
			})
		);
		laneMat.name = 'lane';
		const lane = new THREE.Mesh(laneGeo, laneMat);
		lane.name = 'lane';
		lane.rotation.x = -Math.PI / 2;
		lane.receiveShadow = this.cfg.shadows;
		this.scene.add(lane);

		this.postMatMajor = this.mat(
			new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.tickMajor) })
		);
		this.postMatMinor = this.mat(
			new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.tickMinor) })
		);
		const postGeo = this.track(new THREE.BoxGeometry(0.16, 1.3, 0.16));
		const postR = outerR + 1.4;
		for (let i = 0; i < 10; i++) {
			const a = (i / 10) * Math.PI * 2;
			const post = new THREE.Mesh(postGeo, i % 5 === 0 ? this.postMatMajor : this.postMatMinor);
			post.position.set(postR * Math.sin(a), 0.65, postR * Math.cos(a));
			post.castShadow = this.cfg.shadows;
			this.scene.add(post);
		}

		// Start/finish line — flat checker across the lane at the lap crossing.
		this.cellMatDark = this.mat(
			new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishDark) })
		);
		this.cellMatLight = this.mat(
			new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishLight) })
		);
		const cellGeo = this.track(new THREE.BoxGeometry(0.9, 0.06, 0.95));
		for (let zc = 0; zc < 9; zc++) {
			for (let xc = 0; xc < 2; xc++) {
				const cell = new THREE.Mesh(cellGeo, (zc + xc) % 2 === 0 ? this.cellMatDark : this.cellMatLight);
				cell.position.set(-0.5 + xc, 0.04, innerR + 0.6 + zc * 0.95);
				this.scene.add(cell);
			}
		}
	}

	private applyTheme(themeName: 'light' | 'dark'): void {
		const C = themeName === 'dark' ? COLORS_DARK : COLORS_LIGHT;
		this.theme = themeName;
		this.scene.background = new THREE.Color(C.courseFill);
		this.scene.fog = new THREE.Fog(C.courseFill, 55, 170);

		const recolor = (name: string, color: string) => {
			const obj = this.scene.getObjectByName(name);
			if (obj && obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
				obj.material.color.setHex(hex(color));
			}
		};
		recolor('water', C.laneLine);
		recolor('lane', C.courseFill);

		this.postMatMajor.color.setHex(hex(C.tickMajor));
		this.postMatMinor.color.setHex(hex(C.tickMinor));
		this.cellMatDark.color.setHex(hex(C.finishDark));
		this.cellMatLight.color.setHex(hex(C.finishLight));

		this.recolorAccent(this.liveShell.group, C.live);
		this.recolorAccent(this.ghostShell.group, C.ghost);
	}

	private recolorAccent(group: THREE.Group, color: string): void {
		const c = hex(color);
		group.traverse((o) => {
			if (o instanceof THREE.Mesh && o.userData.accent && o.material instanceof THREE.MeshStandardMaterial) {
				o.material.color.setHex(c);
			}
		});
	}

	resize(cssWidth: number, cssHeight: number): void {
		this.w = cssWidth;
		this.h = cssHeight;
		const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, this.cfg.dprCap);
		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(cssWidth, cssHeight);
		this.camera.aspect = cssWidth / Math.max(cssHeight, 1);
		this.camera.updateProjectionMatrix();
	}

	/** Place a boat on its lap circle and animate hull bob/roll + the stroke. */
	private placeBoat(
		outer: THREE.Group,
		shell: Shell,
		radius: number,
		meters: number,
		spm: number
	): { x: number; z: number; tx: number; tz: number; y: number } {
		const a = this.loopAngle(meters);
		const sin = Math.sin(a);
		const cos = Math.cos(a);
		const x = radius * sin;
		const z = radius * cos;
		const tx = cos; // unit tangent (direction of increasing distance)
		const tz = -sin;
		const bob = this.reduceMotion ? 0 : Math.sin(this.waterPhase * 2 + spm * 0.1) * 0.06;
		outer.position.set(x, 0, z);
		outer.rotation.y = Math.atan2(tx, tz); // local +Z (bow) -> tangent
		shell.group.position.y = bob;
		shell.group.rotation.z = this.reduceMotion ? 0 : Math.sin(this.waterPhase + spm * 0.05) * 0.05;
		this.animateStroke(shell);
		return { x, z, tx, tz, y: bob };
	}

	/** Drive oars + rower from the shared stroke phase (advanced by distance). */
	private animateStroke(shell: Shell): void {
		if (this.reduceMotion) {
			shell.rower.position.z = -0.1;
			shell.rower.rotation.x = -0.1;
			for (const oar of shell.oars) oar.rotation.set(0, 0, 0);
			return;
		}
		const drive = Math.cos(this.strokePhase); // +1 catch (forward) … -1 finish
		const recovery = Math.max(0, -Math.sin(this.strokePhase)); // lift blades on return
		// Rower slides forward at the catch, leans back through the finish.
		shell.rower.position.z = -0.1 + drive * 0.18;
		shell.rower.rotation.x = -0.1 - drive * 0.22;
		for (const oar of shell.oars) {
			const side = (oar.userData.side as number) ?? 1;
			oar.rotation.y = side * drive * 0.5; // sweep fore/aft
			oar.rotation.z = side * recovery * 0.22; // feather/lift on recovery
		}
	}

	render(state: RenderState, playing: boolean, themeName: 'light' | 'dark' = 'light'): void {
		if (this.w === 0) return;
		if (themeName !== this.theme) this.applyTheme(themeName);
		const C = themeName === 'dark' ? COLORS_DARK : COLORS_LIGHT;
		this.reduceMotion = prefersReducedMotion();

		if (playing && !this.reduceMotion) this.waterPhase += 0.04 + state.frame.spm / 800;

		// Stroke phase is driven by distance travelled (~11 m/stroke), so it speeds
		// up with playback rate and freezes when paused — and stays in sync with the
		// boat's motion around the loop regardless of replay speed.
		const liveMeters = state.frame.d;
		const dLive = liveMeters - this.lastLiveMeters;
		this.lastLiveMeters = liveMeters;
		if (!this.reduceMotion && dLive > 0) this.strokePhase += (dLive / 11) * Math.PI * 2;

		// Water displacement (skipped when flat/low quality or phase unchanged).
		const water = this.waterMesh;
		const reduceMotionChanged = this.reduceMotion !== this.lastReduceMotion;
		if (
			this.cfg.waves &&
			(this.waterPhase !== this.lastWaterPhase || reduceMotionChanged) &&
			water?.geometry instanceof THREE.PlaneGeometry
		) {
			const pos = water.geometry.attributes.position;
			const arr = pos.array as Float32Array;
			const count = pos.count;
			for (let i = 0; i < count; i++) {
				const idx = i * 3;
				// local y (arr[idx+1]) maps to world Z after the -90° X rotation, so
				// ripples run along the course rather than as uniform cross-lane bands.
				arr[idx + 2] = this.reduceMotion ? 0 : Math.sin(arr[idx + 1] * 0.25 + this.waterPhase) * 0.08;
			}
			pos.needsUpdate = true;
			water.geometry.computeVertexNormals();
			this.lastWaterPhase = this.waterPhase;
			this.lastReduceMotion = this.reduceMotion;
		}

		const p = this.placeBoat(this.liveBoat, this.liveShell, this.loopRadius, liveMeters, state.frame.spm);

		if (this.liveWake) {
			if (this.reduceMotion) this.liveWake.reset();
			else this.liveWake.update(p.x - p.tx * 1.6, p.z - p.tz * 1.6);
		}

		const laps = Math.max(1, Math.ceil(state.totalDistance / CourseRenderer3D.LOOP_METERS));
		const lap = Math.min(laps, Math.floor(liveMeters / CourseRenderer3D.LOOP_METERS) + 1);
		const liveText =
			laps > 1
				? `YOU · ${fmtPace(state.frame.pace)} · L${lap}/${laps}`
				: `YOU · ${fmtPace(state.frame.pace)} · ${Math.round(clamp01(state.distFrac) * 100)}%`;
		if (liveText !== this.lastLiveLabel) {
			updateTextSprite(this.liveLabel, this.liveLabelTex, liveText, C.labelBg, C.live);
			this.lastLiveLabel = liveText;
		}
		this.liveLabel.position.set(p.x, 2.4 + p.y, p.z);

		if (state.ghost) {
			if (!this.ghostLabel) {
				const spr = makeTextSprite('', C.labelBg, C.ghost);
				this.ghostLabel = spr.sprite;
				this.ghostLabelTex = spr.texture;
				this.scene.add(this.ghostLabel);
			}
			this.ghostLabel.visible = true;
			this.ghostGroup.visible = true;
			const ghostMeters = clamp01(state.ghost.distFrac) * state.totalDistance;
			const dGhost = ghostMeters - this.lastGhostMeters;
			this.lastGhostMeters = ghostMeters;
			// Ghost shares the stroke phase visually; only its placement differs.
			const gp = this.placeBoat(this.ghostGroup, this.ghostShell, this.ghostRadius, ghostMeters, state.ghost.spm);
			if (this.ghostWake) {
				if (this.reduceMotion || dGhost <= 0) {
					if (this.reduceMotion) this.ghostWake.reset();
				} else this.ghostWake.update(gp.x - gp.tx * 1.6, gp.z - gp.tz * 1.6);
			}
			const ghostText = `${state.ghost.label || 'PB'} · ${Math.round(state.ghost.distFrac * 100)}%`;
			if (ghostText !== this.lastGhostLabel && this.ghostLabel && this.ghostLabelTex) {
				updateTextSprite(this.ghostLabel, this.ghostLabelTex, ghostText, C.labelBg, C.ghost);
				this.lastGhostLabel = ghostText;
			}
			this.ghostLabel.position.set(gp.x, 2.2 + gp.y, gp.z);
		} else {
			this.ghostGroup.visible = false;
			if (this.ghostLabel) this.ghostLabel.visible = false;
			this.ghostWake?.reset();
			this.lastGhostLabel = '';
		}

		// Chase camera: behind the live boat along its tangent, raised, looking ahead.
		const back = 9.5;
		const height = 5.5;
		const ahead = 7;
		this.chase.set(p.x - p.tx * back, height, p.z - p.tz * back);
		this.lookAt.set(p.x + p.tx * ahead, 1.1, p.z + p.tz * ahead);
		if (this.cameraInit) {
			this.camera.position.lerp(this.chase, 0.12);
		} else {
			this.camera.position.copy(this.chase);
			this.cameraInit = true;
		}
		this.camera.lookAt(this.lookAt);

		this.renderer.render(this.scene, this.camera);
	}

	private disposeObject3D(root: THREE.Object3D): void {
		root.traverse((o) => {
			if (o instanceof THREE.Mesh) {
				o.geometry.dispose();
				const mats = Array.isArray(o.material) ? o.material : [o.material];
				for (const m of mats) m.dispose();
			}
		});
	}

	destroy(): void {
		this.disposeObject3D(this.liveBoat);
		this.disposeObject3D(this.ghostGroup);
		this.liveWake?.dispose();
		this.ghostWake?.dispose();
		if (this.liveLabel.material instanceof THREE.Material) this.liveLabel.material.dispose();
		if (this.ghostLabel?.material instanceof THREE.Material) this.ghostLabel.material.dispose();
		this.liveLabelTex.dispose();
		this.ghostLabelTex?.dispose();
		for (const m of this.disposables) m.dispose();
		for (const g of this.geometries) g.dispose();
		// Lose the context *before* dispose(): once disposed, getContext() may
		// return a stale/null reference in some three versions.
		const gl = this.renderer.getContext();
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		this.renderer.dispose();
		// Remove the owned canvas so the next 3D activation builds a fresh one.
		this.canvas.remove();
	}
}
