// The people on the rig (see rig.ts): one smoothed Kenney body for everyone, a repainted skin per person,
// idle and run clips from the pack, sitting and typing poses aimed onto the bones, the head following a
// target, blinking by swapping the face texture, the scratch, the stretch, the tumble when slapped; a headset,
// a gold chain, a badge and glasses bolted to the bones; a white name floating above. The same API the
// office, the webcam and co-op used before — the body just arrives async (`Person.ready`).
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BASES, paintSkin, RIG_SCALE, rigAssets, skinImage, OUTFITS, type Body, type Outfit, type Scalp, type SkinSpec } from './rig';

export interface PersonOpts {
  name: string;
  shirt: string;
  body?: Body;                     // man or woman (seeded when absent)
  skin?: string;
  hair?: string;
  hairStyle?: number;              // which painted hair: 0 short/bob, 1 big/curly, 2 combed
  scalp?: Scalp;                   // full, bald, half bald
  outfit?: Outfit;
  unibrow?: boolean;
  glasses?: boolean;
  shades?: boolean;
  beard?: 0 | 1 | 2 | 3;           // none, moustache, goatee, full beard (seeded when absent; women none)
  chain?: boolean;                 // the gold chain and bracelet (default on: this is a scam floor)
  boss?: boolean;                  // Mr. Krull's face
  trousers?: string;
  seed?: number;
}

const SKINS = ['#f0883a', '#e06a2a', '#f29a4a', '#d9582a', '#ff9a3c', '#c94e26'];
const HAIRS = ['#1a1a1a', '#2b1b10', '#3a2416', '#111111', '#4a2f1a', '#5a3a2a'];
const TROUSERS = ['#2a2a2e', '#3b3f5c', '#4a3b2a', '#1f2a3a', '#5a5a60'];

const geo = {
  band: new THREE.TorusGeometry(0.5, 0.045, 8, 24, Math.PI),
  cup: new THREE.CylinderGeometry(0.2, 0.2, 0.13, 14),
  boom: new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8),
  mic: new THREE.SphereGeometry(0.1, 10, 8),
  chain: new THREE.TorusGeometry(0.34, 0.03, 8, 28),
  pendant: new THREE.BoxGeometry(0.1, 0.12, 0.03),
  badge: new THREE.BoxGeometry(0.22, 0.14, 0.02),
  badgeBack: new THREE.BoxGeometry(0.26, 0.18, 0.015),
  frame: new THREE.TorusGeometry(0.11, 0.014, 6, 18),
  lens: new THREE.CircleGeometry(0.105, 18),
  bar: new THREE.BoxGeometry(0.12, 0.02, 0.02),
  bracelet: new THREE.TorusGeometry(0.13, 0.02, 6, 18),
};
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.85, metal = 0): THREE.MeshStandardMaterial {
  const k = color + rough + metal;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); matCache.set(k, m); }
  return m;
}
const BLACK = mat('#1a1a1a', 0.6);
const WHITE = mat('#f4f1ea', 0.8);
const GOLD = mat('#e3b324', 0.3, 0.85);
const BADGE = mat('#6a4bd6', 0.6);
const LENS = mat('#101418', 0.15, 0.4);

function tagTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 384; c.height = 96;
  const g = c.getContext('2d')!;
  g.font = 'bold 54px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(20,10,0,.85)'; g.strokeText(name, 192, 50);
  g.fillStyle = '#fff4dc'; g.fillText(name, 192, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; parent.add(mesh); return mesh;
}

export type Pose = 'sit' | 'stand';
type Bones = Record<'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'head' | 'armL' | 'foreArmL' | 'handL' | 'armR' | 'foreArmR' | 'handR' | 'upLegL' | 'legL' | 'upLegR' | 'legR', THREE.Bone>;
const BONE_NAMES: Record<keyof Bones, string> = { hips: 'Hips', spine: 'Spine', chest: 'Chest', upperChest: 'UpperChest', neck: 'Neck', head: 'Head', armL: 'LeftArm', foreArmL: 'LeftForeArm', handL: 'LeftHand', armR: 'RightArm', foreArmR: 'RightForeArm', handR: 'RightHand', upLegL: 'LeftUpLeg', legL: 'LeftLeg', upLegR: 'RightUpLeg', legR: 'RightLeg' };

const Y = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
// turn a bone so that it points along `dir` (given in the person's local frame); bones point along their +Y
function aim(bone: THREE.Bone, dir: THREE.Vector3, group: THREE.Object3D, k = 1): void {
  bone.parent!.updateWorldMatrix(true, false);
  bone.parent!.getWorldQuaternion(tmpQ);              // P
  const want = tmpV.copy(dir).normalize().applyQuaternion(group.getWorldQuaternion(tmpQ2));
  const current = tmpV2.copy(Y).applyQuaternion(tmpQ2.copy(tmpQ).multiply(bone.quaternion)); // P * L * Y
  const delta = new THREE.Quaternion().setFromUnitVectors(current, want);               // world
  // L' = P^-1 * delta * P * L
  const target = tmpQ.clone().invert().multiply(delta).multiply(tmpQ).multiply(bone.quaternion);
  bone.quaternion.slerp(target, k);
}

export class Person {
  group = new THREE.Group();
  name: string;
  tag: THREE.Sprite;
  hit: THREE.Mesh;
  fallen = 0;
  seated = true;
  pose: Pose = 'sit';
  phase = Math.random() * 10;
  ready: Promise<void>;
  private built = false;
  private root: THREE.Object3D | null = null;
  private bones: Bones | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idle: THREE.AnimationAction | null = null;
  private run: THREE.AnimationAction | null = null;
  private faceMat: THREE.MeshStandardMaterial | null = null;
  private faceOpen: THREE.Texture | null = null;
  private faceClosed: THREE.Texture | null = null;
  private stretchAt = 20 + Math.random() * 30;
  private stretchT = 0;
  private base = new THREE.Vector3();
  private baseRot = 0;
  private moving = 0;
  private blinkAt = 2 + Math.random() * 4;
  private blinking = 0;
  private scratchAt = 18 + Math.random() * 25;
  private scratchT = 0;
  private headYaw = 0;
  private headPitch = 0;
  // where the head should look (the player's mouse on the screen); null = idle drift
  lookTarget: { yaw: number; pitch: number } | null = null;

  scratch(): void { this.scratchT = 1.6; }
  blinkNow(): void { this.blinkAt = 0; }
  // the painted atlas, for the probes
  skinDataUrl(): string | null {
    const img = this.faceOpen?.image as HTMLCanvasElement | undefined;
    if (!img) return null;
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    c.getContext('2d')!.drawImage(img, 0, 0, 1024, 1024);
    return c.toDataURL('image/jpeg', 0.7);
  }
  debugState(): { visible: boolean; blinking: boolean; scratching: boolean; headYaw: number; headPitch: number; pose: string; built: boolean } {
    return { visible: this.group.visible, blinking: this.blinking > 0, scratching: this.scratchT > 0, headYaw: +this.headYaw.toFixed(3), headPitch: +this.headPitch.toFixed(3), pose: this.pose, built: this.built };
  }

  constructor(o: PersonOpts) {
    this.name = o.name;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(o.name), transparent: true, depthTest: false }));
    this.tag.scale.set(1.15, 0.29, 1);
    this.tag.position.set(0, 2.15, 0);
    this.tag.layers.set(1); // sprites stay out of the ambient-occlusion pass (see office.ts renderWith)
    this.group.add(this.tag);
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.set(0, 0.95, 0.1);
    this.hit.userData.person = this;
    this.group.add(this.hit);
    this.ready = this.build(o).catch((e) => { console.warn('person', o.name, e); });
  }

  private async build(o: PersonOpts): Promise<void> {
    const seed = o.seed ?? Math.floor(Math.random() * 1e6);
    const body: Body = o.body ?? ((seed >> 4) % 10 < 3 ? 'woman' : 'man');
    const hairStyle = (o.hairStyle ?? (seed >> 9)) % 3;
    const spec: SkinSpec = {
      body,
      skin: o.skin ?? SKINS[seed % SKINS.length],
      shirt: o.shirt,
      trousers: o.trousers ?? TROUSERS[(seed >> 6) % TROUSERS.length],
      hair: o.hair ?? HAIRS[(seed >> 3) % HAIRS.length],
      scalp: o.scalp ?? (body === 'man' ? (['full', 'full', 'full', 'full', 'full', 'full', 'bald', 'half', 'full', 'half'] as const)[(seed >> 14) % 10] : 'full'),
      outfit: o.outfit ?? OUTFITS[(seed >> 7) % OUTFITS.length],
      beard: body === 'woman' ? 0 : (o.beard ?? ([1, 0, 3, 1, 2][(seed >> 12) % 5] as 0 | 1 | 2 | 3)),
      unibrow: o.unibrow ?? (body === 'man' && (seed >> 16) % 7 === 0),
      seed,
      boss: o.boss,
    };
    const base = BASES[body][hairStyle];
    const [{ body: rigBody, clips }, img] = await Promise.all([rigAssets(), skinImage(base)]);
    const root = cloneSkeleton(rigBody);
    root.scale.setScalar(RIG_SCALE);
    this.root = root;
    const bones = {} as Bones;
    for (const k of Object.keys(BONE_NAMES) as (keyof Bones)[]) { const b = root.getObjectByName(BONE_NAMES[k]) as THREE.Bone | undefined; if (!b) throw new Error('bone ' + BONE_NAMES[k]); bones[k] = b; }
    this.bones = bones;
    this.faceOpen = paintSkin(img, spec, false);
    this.faceClosed = paintSkin(img, spec, true);
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faceOpen, roughness: 0.82 });
    root.traverse((obj) => {
      const m = obj as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) { m.material = this.faceMat!; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    // the headset, in rig units on the head bone (the head is about one unit tall)
    const h = bones.head;
    const band = add(h, geo.band, BLACK, 0, 0.62, 0.02); band.scale.set(1, 1.1, 1);
    for (const sx of [-1, 1]) add(h, geo.cup, BLACK, sx * 0.52, 0.5, 0.02, 0, 0, Math.PI / 2);
    add(h, geo.boom, BLACK, 0.36, 0.26, 0.3, 0.55, 0, -0.95);
    add(h, geo.mic, BLACK, 0.16, 0.08, 0.5);
    if (o.glasses || o.shades) {
      const frameM = mat(o.shades ? '#1a1a1e' : '#2a2a2e', 0.4);
      for (const sx of [-1, 1]) { add(h, geo.frame, frameM, sx * 0.17, 0.5, 0.45); if (o.shades) add(h, geo.lens, LENS, sx * 0.17, 0.5, 0.445); }
      add(h, geo.bar, frameM, 0, 0.5, 0.46);
    }
    const chain = o.chain ?? true;
    if (chain) {
      const ch = add(bones.upperChest, geo.chain, GOLD, 0, 0.3, 0.14, 1.2, 0, 0); ch.scale.set(1.1, 1, 1);
      add(bones.upperChest, geo.pendant, GOLD, 0, 0.05, 0.37);
      add(bones.handR, geo.bracelet, GOLD, 0.02, 0, 0, 0, 0, Math.PI / 2);
    }
    add(bones.upperChest, geo.badgeBack, BADGE, -0.26, 0.22, 0.33);
    add(bones.upperChest, geo.badge, WHITE, -0.26, 0.22, 0.345);
    // clips
    this.mixer = new THREE.AnimationMixer(root);
    const idleClip = clips.find((c) => c.name === 'idle'), runClip = clips.find((c) => c.name === 'run');
    if (idleClip) { this.idle = this.mixer.clipAction(idleClip); this.idle.play(); this.idle.time = Math.random() * idleClip.duration; }
    if (runClip) { this.run = this.mixer.clipAction(runClip); this.run.play(); this.run.setEffectiveWeight(0); this.run.timeScale = 0.8; }
    this.group.add(root);
    this.built = true;
    this.setPose(this.pose);
  }

  setPose(p: Pose): void {
    this.pose = p;
    this.seated = p === 'sit';
    if (this.root) this.root.position.y = p === 'sit' ? -0.2 : 0; // the pelvis drops into the chair
    this.hit.position.set(0, p === 'sit' ? 0.95 : 1.15, 0.1);
    this.tag.position.y = p === 'sit' ? 1.95 : 2.15;
  }

  sitAt(seat: THREE.Vector3, facing: 1 | -1, yaw?: number): void {
    this.setPose('sit');
    this.group.position.set(seat.x, 0, seat.z);
    // a facing-1 desk has its chair on the +z side, so its sitter looks toward -z: that is yaw π for a body whose face is on +z
    this.group.rotation.set(0, yaw ?? (facing === 1 ? Math.PI : 0), 0);
    this.base.copy(this.group.position);
    this.baseRot = this.group.rotation.y;
    this.fallen = 0;
  }

  // standing somewhere on the floor (co-op friends walking around)
  stand(x: number, z: number, yaw: number): void {
    if (this.pose !== 'stand') this.setPose('stand');
    const moved = Math.hypot(x - this.group.position.x, z - this.group.position.z);
    this.moving = moved > 0.02 ? 1 : Math.max(0, this.moving - 0.1);
    this.group.position.set(x, 0, z);
    this.group.rotation.set(0, yaw, 0);
    this.base.copy(this.group.position);
    this.baseRot = yaw;
    this.fallen = 0;
  }

  fall(): void { this.fallen = 0.001; }

  cough(): void { this.phase += 2; this.stretchT = 0.8; }

  update(dt: number, t: number): void {
    const s = dt / 1000;
    this.phase += s;
    const p = this.phase;
    if (!this.built || !this.bones || !this.mixer) { void t; return; }
    const B = this.bones;
    // the clips first: idle always, run blended in while walking
    this.run?.setEffectiveWeight(this.pose === 'stand' ? this.moving : 0);
    this.idle?.setEffectiveWeight(this.pose === 'stand' ? 1 - this.moving * 0.85 : 1);
    this.mixer.update(s);
    if (this.pose === 'stand') this.moving = Math.max(0, this.moving - s * 1.5);
    // sitting: thighs forward, shins down, arms to the keyboard (typing bob on the forearms)
    if (this.pose === 'sit') {
      const typing = Math.sin(p * 0.21) > -0.4;
      const bobL = typing ? Math.sin(p * 11) * 0.06 : 0, bobR = typing ? Math.sin(p * 11 + 1.9) * 0.06 : 0;
      aim(B.upLegL, new THREE.Vector3(0.12, -0.08, 1), this.group);
      aim(B.upLegR, new THREE.Vector3(-0.12, -0.08, 1), this.group);
      aim(B.legL, new THREE.Vector3(0.05, -1, 0.1), this.group);
      aim(B.legR, new THREE.Vector3(-0.05, -1, 0.1), this.group);
      let stretch = 0;
      this.stretchAt -= s;
      if (this.stretchAt <= 0 && this.stretchT <= 0) { this.stretchT = 1.6; this.stretchAt = 25 + Math.random() * 30; }
      if (this.stretchT > 0) { this.stretchT -= s; stretch = Math.sin(Math.min(1, (1.6 - this.stretchT) / 1.6) * Math.PI); }
      this.scratchAt -= s;
      if (this.scratchAt <= 0 && this.scratchT <= 0) { this.scratchT = 1.6; this.scratchAt = 25 + Math.random() * 35; }
      let scratch = 0;
      if (this.scratchT > 0) { this.scratchT -= s; scratch = Math.sin(Math.min(1, (1.6 - this.scratchT) / 1.6) * Math.PI); }
      // arms: typing, lifted overhead for the stretch, the right one swung back for the scratch
      const upL = new THREE.Vector3(0.3, -0.55 + stretch * 1.5, 0.7 - stretch * 0.4);
      const upR = new THREE.Vector3(-0.3 - scratch * 0.5, -0.55 + stretch * 1.5 - scratch * 0.3, 0.7 - stretch * 0.4 - scratch * 1.3);
      aim(B.armL, upL, this.group);
      aim(B.armR, upR, this.group);
      aim(B.foreArmL, new THREE.Vector3(-0.1, -0.25 + bobL + stretch * 1.2, 1 - stretch * 0.5), this.group);
      aim(B.foreArmR, new THREE.Vector3(0.1 + scratch * 0.4, -0.25 + bobR + stretch * 1.2 - scratch * 0.9 + Math.sin(p * 22) * 0.15 * scratch, 1 - stretch * 0.5 - scratch * 1.2), this.group);
      if (this.fallen <= 0) this.group.rotation.y = this.baseRot + Math.sin(p * 0.5) * 0.06;
      this.group.rotation.z = -0.05 * scratch;
    } else { this.scratchT = 0; this.stretchT = 0; this.group.rotation.z = 0; }
    // the head: follows the mouse, or drifts
    if (this.lookTarget) {
      this.headYaw += (this.lookTarget.yaw + Math.sin(p * 1.1) * 0.03 - this.headYaw) * Math.min(1, s * 8);
      this.headPitch += (this.lookTarget.pitch + Math.sin(p * 0.8) * 0.02 - this.headPitch) * Math.min(1, s * 8);
    } else { this.headYaw = Math.sin(p * 0.35) * 0.3 + Math.sin(p * 1.1) * 0.05; this.headPitch = Math.sin(p * 0.8) * 0.05; }
    B.head.quaternion.multiply(tmpQ.setFromEuler(new THREE.Euler(this.headPitch, this.headYaw, 0, 'YXZ')));
    // blink
    this.blinkAt -= s;
    if (this.blinkAt <= 0 && this.blinking <= 0 && this.faceMat) { this.blinking = 0.14; this.faceMat.map = this.faceClosed; }
    if (this.blinking > 0) { this.blinking -= Math.min(s, 0.05); if (this.blinking <= 0 && this.faceMat) { this.faceMat.map = this.faceOpen; this.blinkAt = 2 + Math.random() * 5; } } // a blink is at least three frames, however slow the machine
    // the tumble
    if (this.fallen > 0) {
      this.fallen += s;
      const k = Math.min(1, this.fallen * 2.4);
      const bounce = Math.sin(Math.min(1, this.fallen * 1.5) * Math.PI) * 0.15;
      this.group.rotation.z = -1.45 * k;
      this.group.rotation.y = this.baseRot + 0.6 * k;
      this.group.position.y = -0.52 * k + bounce;
      this.group.position.x = this.base.x + 0.95 * k * (this.baseRot === 0 ? 1 : -1);
      this.seated = false;
    } else if (this.group.position.y !== 0) { this.group.position.y = 0; this.group.position.x = this.base.x; }
    void t;
  }
}

export function makePerson(o: PersonOpts): Person { return new Person(o); }
