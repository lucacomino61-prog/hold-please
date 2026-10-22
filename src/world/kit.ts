// Kenney's Furniture Kit (CC0, public/models/kit, licence alongside): each model is loaded once, cloned
// per placement, recoloured by material name to our palette, scaled to a real height in metres and
// stood on the floor with its footprint centred on (x, z).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

export function kitModel(name: string): Promise<THREE.Group> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`/models/kit/${name}.glb`).then((g) => g.scene);
    cache.set(name, p);
  }
  return p;
}

export interface Placement {
  name: string;
  x: number;
  z: number;
  y?: number;             // floor height of the base (0 = the carpet)
  ry?: number;            // yaw in radians
  h: number;              // the model is scaled so it stands this tall
  w?: number;             // ...or, for flat things like rugs, so it is this wide
  colors?: Record<string, string>; // material name → colour (the kit names: wood, woodDark, metal, metalDark, metalMedium, metalLight, carpet, carpetWhite, plant, _defaultMat)
  shadow?: boolean;
  rough?: number;
  tag?: string;           // a name to find the placed object by later (office.ts keeps a map)
}

const tmpBox = new THREE.Box3();
const tmpSize = new THREE.Vector3();
const tmpCentre = new THREE.Vector3();

export async function placeKit(parent: THREE.Object3D, p: Placement): Promise<THREE.Group> {
  const src = await kitModel(p.name);
  const obj = src.clone(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = p.shadow !== false;
    m.receiveShadow = true;
    const tint = (mm: THREE.Material): THREE.Material => {
      const c = (mm as THREE.MeshStandardMaterial).clone();
      const want = p.colors?.[c.name];
      if (want) c.color.set(want);
      c.roughness = p.rough ?? 0.8;
      c.metalness = 0;
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
  });
  obj.rotation.y = p.ry ?? 0;
  tmpBox.setFromObject(obj);
  tmpBox.getSize(tmpSize);
  const s = p.w ? p.w / Math.max(0.001, tmpSize.x) : p.h / Math.max(0.001, tmpSize.y);
  obj.scale.setScalar(s);
  tmpBox.setFromObject(obj);
  tmpBox.getCenter(tmpCentre);
  obj.position.x += p.x - tmpCentre.x;
  obj.position.z += p.z - tmpCentre.z;
  obj.position.y += (p.y ?? 0) - tmpBox.min.y;
  parent.add(obj);
  return obj;
}

export function placeMany(parent: THREE.Object3D, list: Placement[]): Promise<THREE.Group[]> {
  return Promise.all(list.map((p) => placeKit(parent, p)));
}
