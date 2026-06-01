import * as THREE from 'three';
import type { ReplayRenderer, RenderState } from './renderer';
import { COLORS_DARK, COLORS_LIGHT } from './renderer';
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
	if (canvas.width !== Math.ceil(tw + pad * 2)) {
		canvas.width = Math.ceil(tw + pad * 2);
	}
	canvas.height = fontSize + pad * 2;
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

function makeBoat(color: number): THREE.Group {
	const hull = new THREE.Mesh(
		new THREE.BoxGeometry(1.4, 0.35, 2.6),
		new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 })
	);
	hull.position.y = 0.2;
	const bow = new THREE.Mesh(
		new THREE.ConeGeometry(0.45, 0.9, 4),
		new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15 })
	);
	bow.rotation.x = Math.PI / 2;
	bow.position.set(0, 0.25, 1.55);
	const group = new THREE.Group();
	group.add(hull, bow);
	return group;
}

/**
 * WebGL course replay — lazy-loaded; mirrors 2D RenderState in a low-poly scene.
 * `three` is imported only in this module.
 */
export class CourseRenderer3D implements ReplayRenderer {
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private courseLength = 80;
	private w = 0;
	private h = 0;
	private waterPhase = 0;
	private reduceMotion = false;
	private theme: 'light' | 'dark' = 'light';

	private liveBoat: THREE.Group;
	private ghostBoat: THREE.Group;
	private ghostGroup: THREE.Group;
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

	constructor(canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		this.renderer.setPixelRatio(1);
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
		this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
		const sun = new THREE.DirectionalLight(0xffffff, 0.85);
		sun.position.set(12, 24, 8);
		this.scene.add(sun);

		this.liveBoat = makeBoat(hex(COLORS_LIGHT.live));
		this.ghostBoat = makeBoat(hex(COLORS_LIGHT.ghost));
		this.ghostGroup = new THREE.Group();
		this.ghostGroup.visible = false;
		this.ghostGroup.add(this.ghostBoat);
		this.scene.add(this.liveBoat, this.ghostGroup);

		const liveSpr = makeTextSprite('', COLORS_LIGHT.labelBg, COLORS_LIGHT.live);
		this.liveLabel = liveSpr.sprite;
		this.liveLabelTex = liveSpr.texture;
		this.scene.add(this.liveLabel);

		this.buildStaticScene();
	}

	private track<T extends THREE.BufferGeometry>(g: T): T {
		this.geometries.push(g);
		return g;
	}

	private mat<T extends THREE.Material>(m: T): T {
		this.disposables.push(m);
		return m;
	}

	private buildStaticScene(): void {
		const waterGeo = this.track(new THREE.PlaneGeometry(120, 120, 32, 32));
		const waterMat = this.mat(
			new THREE.MeshStandardMaterial({
				color: 0x8aa2ac,
				transparent: true,
				opacity: 0.35,
				roughness: 0.9,
				metalness: 0,
				side: THREE.DoubleSide
			})
		);
		waterMat.name = 'water';
		const water = new THREE.Mesh(waterGeo, waterMat);
		water.rotation.x = -Math.PI / 2;
		water.position.y = -0.05;
		water.name = 'water';
		this.scene.add(water);

		const laneGeo = this.track(new THREE.BoxGeometry(8, 0.08, this.courseLength));
		const laneMat = this.mat(
			new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.courseFill), roughness: 0.85 })
		);
		laneMat.name = 'lane';
		const lane = new THREE.Mesh(laneGeo, laneMat);
		lane.position.set(0, 0, this.courseLength / 2);
		this.scene.add(lane);

		for (let i = 0; i <= 10; i++) {
			const z = (this.courseLength * i) / 10;
			const postGeo = this.track(new THREE.BoxGeometry(0.12, 1.2, 0.12));
			const postMat = this.mat(
				new THREE.MeshStandardMaterial({
					color: i % 5 === 0 ? hex(COLORS_LIGHT.tickMajor) : hex(COLORS_LIGHT.tickMinor)
				})
			);
			const post = new THREE.Mesh(postGeo, postMat);
			post.position.set(-5.5, 0.6, z);
			this.scene.add(post);
		}

		const finishGeo = this.track(new THREE.BoxGeometry(9, 2.2, 0.4));
		const finishMat = this.mat(new THREE.MeshStandardMaterial({ color: hex(COLORS_LIGHT.finishDark) }));
		finishMat.name = 'finish';
		const finish = new THREE.Mesh(finishGeo, finishMat);
		finish.position.set(0, 1.1, this.courseLength + 0.5);
		this.scene.add(finish);

		for (let r = 0; r < 6; r++) {
			for (let c = 0; c < 3; c++) {
				const cellGeo = this.track(new THREE.BoxGeometry(0.9, 0.9, 0.08));
				const cellMat = this.mat(
					new THREE.MeshStandardMaterial({
						color: (r + c) % 2 === 0 ? hex(COLORS_LIGHT.finishDark) : hex(COLORS_LIGHT.finishLight)
					})
				);
				const cell = new THREE.Mesh(cellGeo, cellMat);
				cell.position.set(-2.5 + c * 2.5, 0.5 + r * 0.95, this.courseLength + 0.72);
				this.scene.add(cell);
			}
		}
	}

	private applyTheme(themeName: 'light' | 'dark'): void {
		const C = themeName === 'dark' ? COLORS_DARK : COLORS_LIGHT;
		this.theme = themeName;
		this.scene.background = new THREE.Color(C.courseFill);
		this.scene.fog = new THREE.Fog(C.courseFill, 40, 140);

		const recolor = (name: string, color: string) => {
			const obj = this.scene.getObjectByName(name);
			if (obj && obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
				obj.material.color.setHex(hex(color));
			}
		};
		recolor('water', C.laneLine);
		recolor('lane', C.courseFill);
		recolor('finish', C.finishDark);

		this.recolorBoat(this.liveBoat, C.live);
		this.recolorBoat(this.ghostBoat, C.ghost);
	}

	private recolorBoat(group: THREE.Group, color: string): void {
		const c = hex(color);
		group.traverse((o) => {
			if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
				o.material.color.setHex(c);
			}
		});
	}

	resize(cssWidth: number, cssHeight: number): void {
		this.w = cssWidth;
		this.h = cssHeight;
		const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(cssWidth, cssHeight, false);
		this.camera.aspect = cssWidth / Math.max(cssHeight, 1);
		this.camera.updateProjectionMatrix();
	}

	render(state: RenderState, playing: boolean, themeName: 'light' | 'dark' = 'light'): void {
		if (this.w === 0) return;
		if (themeName !== this.theme) this.applyTheme(themeName);
		const C = themeName === 'dark' ? COLORS_DARK : COLORS_LIGHT;
		this.reduceMotion = prefersReducedMotion();

		if (playing && !this.reduceMotion) this.waterPhase += 0.04 + state.frame.spm / 800;

		const water = this.scene.getObjectByName('water') as THREE.Mesh | undefined;
		if (water?.geometry instanceof THREE.PlaneGeometry) {
			const pos = water.geometry.attributes.position;
			for (let i = 0; i < pos.count; i++) {
				const x = pos.getX(i);
				const y = pos.getY(i);
				const wave = this.reduceMotion ? 0 : Math.sin(x * 0.25 + this.waterPhase) * 0.08;
				pos.setZ(i, wave);
			}
			pos.needsUpdate = true;
			water.geometry.computeVertexNormals();
		}

		const liveZ = clamp01(state.distFrac) * this.courseLength;
		const bob = this.reduceMotion ? 0 : Math.sin(this.waterPhase * 2 + state.frame.spm * 0.1) * 0.06;
		this.liveBoat.position.set(0, bob, liveZ);
		this.liveBoat.rotation.z = Math.sin(this.waterPhase + state.frame.spm * 0.05) * 0.04;

		const liveText = `${fmtPace(state.frame.pace)} · ${Math.round(state.distFrac * 100)}%`;
		if (liveText !== this.lastLiveLabel) {
			updateTextSprite(this.liveLabel, this.liveLabelTex, liveText, C.labelBg, C.live);
			this.lastLiveLabel = liveText;
		}
		this.liveLabel.position.set(0, 2.2 + bob, liveZ);

		if (state.ghost) {
			if (!this.ghostLabel) {
				const spr = makeTextSprite('', C.labelBg, C.ghost);
				this.ghostLabel = spr.sprite;
				this.ghostLabelTex = spr.texture;
				this.scene.add(this.ghostLabel);
			}
			this.ghostGroup.visible = true;
			const ghostZ = clamp01(state.ghost.distFrac) * this.courseLength;
			const gBob = this.reduceMotion ? 0 : Math.sin(this.waterPhase * 2 + state.ghost.spm * 0.1) * 0.05;
			this.ghostBoat.position.set(-4.5, gBob, ghostZ);
			const ghostText = `${state.ghost.label || 'PB'} · ${Math.round(state.ghost.distFrac * 100)}%`;
			if (ghostText !== this.lastGhostLabel && this.ghostLabel && this.ghostLabelTex) {
				updateTextSprite(this.ghostLabel, this.ghostLabelTex, ghostText, C.labelBg, C.ghost);
				this.lastGhostLabel = ghostText;
			}
			this.ghostLabel.position.set(-4.5, 2.1 + gBob, ghostZ);
		} else {
			this.ghostGroup.visible = false;
			this.lastGhostLabel = '';
		}

		this.chase.set(0, 5.5, liveZ - 9);
		this.lookAt.set(0, 1.2, liveZ + 6);
		this.camera.position.lerp(this.chase, 0.12);
		const camLook = this.lookAt.clone();
		this.camera.lookAt(camLook);

		this.renderer.render(this.scene, this.camera);
	}

	destroy(): void {
		this.liveLabelTex.dispose();
		this.ghostLabelTex?.dispose();
		for (const m of this.disposables) m.dispose();
		for (const g of this.geometries) g.dispose();
		this.renderer.dispose();
		const gl = this.renderer.getContext();
		const ext = gl.getExtension('WEBGL_lose_context');
		ext?.loseContext();
	}
}
