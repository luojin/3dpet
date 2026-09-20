import * as THREE from 'three'

/** @typedef {{ kind: 'circle', x: number, z: number, r: number, passable?: boolean }} CircleCollider */
/** @typedef {{ kind: 'bridge', x: number, z: number, halfW: number, halfL: number, axisX: number, axisZ: number }} BridgeZone */

export const colliders = /** @type {CircleCollider[]} */ ([])
export const bridgeZones = /** @type {BridgeZone[]} */ ([])

/** @type {THREE.CatmullRomCurve3 | null} */
export let creekCurve = null
export const CREEK_HALF_WIDTH = 0.95
export const PET_RADIUS = 0.38
export const WORLD_RADIUS = 110

export function resetWorldCollision() {
  colliders.length = 0
  bridgeZones.length = 0
  creekCurve = null
}

export function setCreekCurve(curve) {
  creekCurve = curve
}

export function addCircleCollider(x, z, r, passable = false) {
  colliders.push({ kind: 'circle', x, z, r, passable })
}

export function addBridgeZone(x, z, halfW, halfL, axisX, axisZ) {
  const len = Math.hypot(axisX, axisZ) || 1
  bridgeZones.push({
    kind: 'bridge',
    x,
    z,
    halfW,
    halfL,
    axisX: axisX / len,
    axisZ: axisZ / len,
  })
}

export function onBridge(x, z) {
  for (const b of bridgeZones) {
    const dx = x - b.x
    const dz = z - b.z
    const along = dx * b.axisX + dz * b.axisZ
    const side = dx * -b.axisZ + dz * b.axisX
    if (Math.abs(along) <= b.halfL && Math.abs(side) <= b.halfW) return true
  }
  return false
}

export function inCreek(x, z) {
  if (!creekCurve || onBridge(x, z)) return false
  let nearest = Infinity
  for (let i = 0; i <= 400; i += 1) {
    const p = creekCurve.getPoint(i / 400)
    const d = Math.hypot(p.x - x, p.z - z)
    if (d < nearest) nearest = d
  }
  return nearest < CREEK_HALF_WIDTH
}

export function blockedByProps(x, z, radius = PET_RADIUS) {
  for (const c of colliders) {
    if (c.passable) continue
    if (Math.hypot(c.x - x, c.z - z) < c.r + radius) return true
  }
  return false
}

export function canStandAt(x, z, radius = PET_RADIUS) {
  if (Math.hypot(x, z) > WORLD_RADIUS) return false
  if (inCreek(x, z)) return false
  if (blockedByProps(x, z, radius)) return false
  return true
}

export function tryMove(fromX, fromZ, dx, dz, radius = PET_RADIUS) {
  const nx = fromX + dx
  const nz = fromZ + dz
  if (canStandAt(nx, nz, radius)) return { x: nx, z: nz }
  if (canStandAt(nx, fromZ, radius)) return { x: nx, z: fromZ }
  if (canStandAt(fromX, nz, radius)) return { x: fromX, z: nz }
  return { x: fromX, z: fromZ }
}

export function meshGroundBox(root) {
  const box = new THREE.Box3()
  let has = false
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    if (!obj.isMesh) return
    const b = new THREE.Box3().setFromObject(obj)
    if (!has) {
      box.copy(b)
      has = true
    } else box.union(b)
  })
  if (!has) box.setFromObject(root)
  return box
}

/**
 * Convert Quaternius PBR materials to bright MeshLambert so RTS props match
 * the hand-painted farm (which is all MeshLambert + warm lights).
 */
export function stylizeVillageMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return
    const list = Array.isArray(obj.material) ? obj.material : [obj.material]
    const next = list.map((mat) => {
      if (!mat) return mat
      const color = mat.color ? mat.color.clone() : new THREE.Color(0xffffff)
      // Lift muddy RTS tones toward the farm's sunny palette.
      color.offsetHSL(0.01, 0.08, 0.16)
      color.r = Math.min(1, color.r * 1.12)
      color.g = Math.min(1, color.g * 1.1)
      color.b = Math.min(1, color.b * 1.05)
      const lambert = new THREE.MeshLambertMaterial({
        color,
        map: mat.map || null,
        alphaMap: mat.alphaMap || null,
        transparent: !!mat.transparent,
        opacity: mat.opacity ?? 1,
        side: mat.side ?? THREE.FrontSide,
        alphaTest: mat.alphaTest || 0,
        depthWrite: mat.depthWrite !== false,
      })
      if (lambert.map) lambert.map.colorSpace = THREE.SRGBColorSpace
      mat.dispose?.()
      return lambert
    })
    obj.material = next.length === 1 ? next[0] : next
  })
}

/**
 * Scale a Quaternius RTS prop so its mesh height matches targetHeight,
 * sit on y=0, and register a circular collider.
 * Optional maxXZ caps the horizontal footprint after height scaling.
 */
export function seatProp(root, x, z, rotY, targetHeight, colliderScale = 0.72, maxXZ = 0) {
  root.position.set(0, 0, 0)
  root.rotation.set(0, rotY, 0)
  root.scale.setScalar(1)
  root.updateMatrixWorld(true)
  const box = meshGroundBox(root)
  const size = box.getSize(new THREE.Vector3())
  const h = Math.max(size.y, 0.01)
  let scale = targetHeight / h
  if (maxXZ > 0) {
    const xz = Math.max(size.x, size.z) * scale
    if (xz > maxXZ) scale *= maxXZ / xz
  }
  root.scale.setScalar(scale)
  root.updateMatrixWorld(true)
  const scaled = meshGroundBox(root)
  const center = scaled.getCenter(new THREE.Vector3())
  root.position.set(x - center.x, -scaled.min.y, z - center.z)
  root.updateMatrixWorld(true)
  const finalBox = meshGroundBox(root)
  const finalSize = finalBox.getSize(new THREE.Vector3())
  const rawR = Math.max(finalSize.x, finalSize.z) * 0.5 * Math.max(0, colliderScale)
  const r = Math.min(3.2, Math.max(0.28, rawR))
  if (colliderScale > 0) addCircleCollider(x, z, r)
  root.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = true
    obj.receiveShadow = true
  })
  return root
}
