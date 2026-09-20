import * as THREE from 'three'
import {
  seatProp,
  addCircleCollider,
  stylizeVillageMaterials,
  colliders,
  inCreek,
} from './world.js'

const V = (name) => `${import.meta.env.BASE_URL}models/village/${name}`

/** Building types allowed on each village grid. */
const BUILDING_FILES = [
  'Fortress.glb',
  'Temple.glb',
  'Temple_B.glb',
  'Temple_C.glb',
  'Wooden_Temple.glb',
  'Barracks.glb',
  'Barracks_B.glb',
  'Barracks_C.glb',
  'Barracks_D.glb',
  'House.glb',
  'House_B.glb',
  'House_C.glb',
  'House_D.glb',
  'Houses.glb',
  'Houses_B.glb',
  'Small_Farm.glb',
  'Farm.glb',
  'Farm_B.glb',
  'Shipping_Port.glb',
  'Shipping_Port_B.glb',
  'Town_Center.glb',
  'Town_Center_B.glb',
  'Town_Center_Second_Age.glb',
]

const PLANT_FILES = [
  { file: 'Pine_Trees.glb', h: 3.4, maxXZ: 2.8, colliderScale: 0.28 },
  { file: 'Trees.glb', h: 3.1, maxXZ: 2.8, colliderScale: 0.3 },
  { file: 'Rock.glb', h: 0.55, maxXZ: 1.4, colliderScale: 0.7 },
  { file: 'Rocks.glb', h: 0.6, maxXZ: 1.8, colliderScale: 0.65 },
]

const PET_WIDTH = 1.2
const STREET_GAP = PET_WIDTH * 3.5
/** Match starter farm barn (~3.1×2.45 body, ridge ≈3.35). */
const HOUSE_H = 3.35
const HOUSE_MAX_XZ = 3.9
/** Compound / civic buildings stay larger than a single house. */
const LARGE_H = 4.5
const LARGE_MAX_XZ = 5.6
const BUILDING_MAX_XZ = LARGE_MAX_XZ
const CELL = BUILDING_MAX_XZ + STREET_GAP
const GRID = 8
const GRID_SPAN = (GRID - 1) * CELL

const LARGE_BUILDING_RE =
  /Fortress|Town_Center|Houses|Shipping_Port|Barracks|Temple|Farm\.glb|Farm_B/

function buildingLimits(file) {
  if (LARGE_BUILDING_RE.test(file)) return { h: LARGE_H, maxXZ: LARGE_MAX_XZ }
  return { h: HOUSE_H, maxXZ: HOUSE_MAX_XZ }
}

/**
 * Two villages:
 * - East bank (right of creek)
 * - West of the farm, with a clear buffer so nothing overlaps the yard
 */
const VILLAGES = [
  { originX: 12.0, originZ: -30.0 },
  // Farm sits near x≈-3..3; keep village's east edge ~12u clear of the barn.
  { originX: -12.0 - GRID_SPAN - 12.0, originZ: -28.0 },
]

/** Keep decorative plants out of the starter farm yard. */
const FARM_CLEAR = { x: -1.0, z: -5.5, r: 12.0 }

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function wouldOverlap(x, z, r, pad = 0.35) {
  if (inCreek(x, z)) return true
  for (const c of colliders) {
    if (Math.hypot(c.x - x, c.z - z) < c.r + r + pad) return true
  }
  return false
}

function nearFarm(x, z, extra = 0) {
  return Math.hypot(x - FARM_CLEAR.x, z - FARM_CLEAR.z) < FARM_CLEAR.r + extra
}

function estimateBuildingRadius() {
  return BUILDING_MAX_XZ * 0.5 * 0.72
}

async function placeVillage(group, loadOne, originX, originZ) {
  const buildingR = estimateBuildingRadius()

  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const x = originX + col * CELL
      const z = originZ + row * CELL
      if (nearFarm(x, z, buildingR)) continue
      if (wouldOverlap(x, z, buildingR)) continue
      const file = pick(BUILDING_FILES)
      const { h, maxXZ } = buildingLimits(file)
      try {
        const root = await loadOne(file)
        const rot = (Math.floor(Math.random() * 4) * Math.PI) / 2
        seatProp(root, x, z, rot, h, 0.72, maxXZ)
        group.add(root)
      } catch (err) {
        console.warn('building failed', file, err)
      }
    }
  }

  const plantSlots = []
  const ring = CELL * 0.5 + STREET_GAP * 0.55 + 1.6
  for (let i = 0; i < GRID; i += 1) {
    const along = i * CELL
    plantSlots.push([originX + along, originZ - ring])
    plantSlots.push([originX + along, originZ + GRID_SPAN + ring])
    plantSlots.push([originX - ring, originZ + along])
    plantSlots.push([originX + GRID_SPAN + ring, originZ + along])
  }
  plantSlots.push([originX - ring, originZ - ring])
  plantSlots.push([originX + GRID_SPAN + ring, originZ - ring])
  plantSlots.push([originX - ring, originZ + GRID_SPAN + ring])
  plantSlots.push([originX + GRID_SPAN + ring, originZ + GRID_SPAN + ring])

  for (const [x, z] of plantSlots) {
    if (Math.random() > 0.7) continue
    const kind = pick(PLANT_FILES)
    const r = Math.max(0.35, kind.maxXZ * 0.5 * kind.colliderScale)
    if (nearFarm(x, z, r + 1)) continue
    if (wouldOverlap(x, z, r, 0.5)) continue
    try {
      const root = await loadOne(kind.file)
      seatProp(root, x, z, Math.random() * Math.PI * 2, kind.h, kind.colliderScale, kind.maxXZ)
      group.add(root)
    } catch (err) {
      console.warn('plant failed', kind.file, err)
    }
  }
}

export async function loadVillages(scene, loader) {
  const group = new THREE.Group()
  group.name = 'villages'
  scene.add(group)

  const cache = new Map()
  const loadOne = async (file) => {
    if (cache.has(file)) return cache.get(file).clone(true)
    const gltf = await loader.loadAsync(V(file))
    stylizeVillageMaterials(gltf.scene)
    cache.set(file, gltf.scene)
    return gltf.scene.clone(true)
  }

  for (const v of VILLAGES) {
    await placeVillage(group, loadOne, v.originX, v.originZ)
  }

  return group
}

export function registerFarmColliders() {
  addCircleCollider(-2.7, -5.1, 1.85)
  addCircleCollider(0.2, -6.6, 0.7)
  addCircleCollider(-1.5, -9.0, 0.65)
  addCircleCollider(3.4, -10.6, 0.7)
  addCircleCollider(-1.15, -3.15, 0.45)
  for (let i = 0; i <= 3; i += 1) {
    addCircleCollider(0.2 + i * 0.52, -1.85, 0.22)
  }
}
