import * as THREE from 'three'
import {
  addBridgeZone,
  addCircleCollider,
  bridgeZones,
  removeCollidersBySource,
  setCreekCurve,
  setCreekRoot,
} from './world.js'

function paint(color) {
  return new THREE.MeshLambertMaterial({ color })
}

function tag(group, id, label, extra = {}) {
  group.name = id
  group.userData.baseId = id
  group.userData.label = label
  group.userData.kind = 'base'
  Object.assign(group.userData, extra)
  return group
}

function makeGrassMap() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#67c43a'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * size
    const y = Math.random() * size
    ctx.strokeStyle = Math.random() > 0.5 ? '#4eaa28' : '#9ae268'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 4, y - 8, x + (Math.random() - 0.5) * 8, y - 14 - Math.random() * 8)
    ctx.stroke()
  }
  const colors = ['#ff6b8a', '#ffe566', '#ffffff', '#ff9a4a']
  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = colors[i % colors.length]
    ctx.beginPath()
    ctx.arc(Math.random() * size, Math.random() * size, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(36, 36)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeSkyMap() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const sky = ctx.createLinearGradient(0, 0, 0, 512)
  sky.addColorStop(0, '#5eafff')
  sky.addColorStop(0.45, '#b7e6ff')
  sky.addColorStop(0.78, '#e7f7ff')
  sky.addColorStop(1, '#f3ffe8')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 1024, 512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeBarn() {
  const w = 3.1
  const d = 2.45
  const h = 2.15
  const overhangX = 0.34
  const overhangZ = 0.28
  const rise = 1.2
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint(0xe24b3a))
  body.position.y = h / 2
  body.castShadow = true
  body.receiveShadow = true
  const shape = new THREE.Shape()
  shape.moveTo(-(w / 2 + overhangX), h - 0.22)
  shape.lineTo(0, h + rise)
  shape.lineTo(w / 2 + overhangX, h - 0.22)
  shape.closePath()
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + overhangZ * 2, bevelEnabled: false })
  roofGeo.translate(0, 0, -(d / 2 + overhangZ))
  const roof = new THREE.Mesh(roofGeo, paint(0x8d3a2a))
  roof.material.side = THREE.DoubleSide
  roof.castShadow = true
  roof.receiveShadow = true
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.25, 0.06), paint(0xf6e4c4))
  door.position.set(0, 0.64, d / 2 + 0.02)
  const loft = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.06), paint(0xfff6df))
  loft.position.set(0, 1.72, d / 2 + 0.02)
  group.add(body, roof, door, loft)
  group.position.set(-2.7, 0, -5.1)
  group.rotation.y = 0.35
  group.userData.circles = [{ x: 0, z: 0, r: 1.85 }]
  return tag(group, 'barn', '谷仓')
}

function makeTree(id, x, z, height, radius) {
  const group = new THREE.Group()
  const trunkH = height * 0.4
  const crown = height * 0.3
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(crown * 0.16, crown * 0.24, trunkH, 8),
    paint(0x8a5a32),
  )
  trunk.position.y = trunkH / 2
  trunk.castShadow = true
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(crown, 10, 8), paint(0x3aaa34))
  leaf.position.y = trunkH + crown * 0.45
  leaf.scale.y = 0.86
  leaf.castShadow = true
  const leaf2 = new THREE.Mesh(new THREE.SphereGeometry(crown * 0.72, 8, 7), paint(0x62c84e))
  leaf2.position.set(crown * 0.35, trunkH + crown * 1.05, crown * 0.08)
  leaf2.castShadow = true
  group.add(trunk, leaf, leaf2)
  group.position.set(x, 0, z)
  group.userData.circles = [{ x: 0, z: 0, r: radius }]
  return tag(group, id, '树')
}

function makeWindmill() {
  const towerH = 7.4
  const hubY = towerH - 0.55
  const group = new THREE.Group()
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.48, towerH, 10), paint(0xf7f1e1))
  tower.position.y = towerH / 2
  tower.castShadow = true
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 8), paint(0xe24b3a))
  cap.position.y = towerH + 0.22
  cap.castShadow = true
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.35), paint(0xf6f1e6))
  nacelle.position.set(0, hubY, 0.2)
  nacelle.castShadow = true
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.425, 10), paint(0x8a5a32))
  shaft.rotation.x = Math.PI / 2
  shaft.position.set(0, hubY, 0.52)
  shaft.castShadow = true
  const blades = new THREE.Group()
  blades.position.set(0, hubY, 0.78)
  const bladeMat = paint(0xfffaf2)
  const bladeGeo = new THREE.BoxGeometry(0.16, 1.45, 0.05)
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), paint(0xe7d7b8))
  blades.add(hub)
  for (let i = 0; i < 4; i += 1) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.position.y = 0.78
    const pivot = new THREE.Group()
    pivot.rotation.z = (i * Math.PI) / 2
    pivot.add(blade)
    blades.add(pivot)
  }
  group.add(tower, cap, nacelle, shaft, blades)
  group.position.set(3.4, 0, -10.6)
  group.rotation.y = 0.55
  group.userData.blades = blades
  group.userData.circles = [{ x: 0, z: 0, r: 0.7 }]
  return tag(group, 'windmill', '风车')
}

function makeFence() {
  const group = new THREE.Group()
  const centerX = 0.98
  const centerZ = -1.85
  group.position.set(centerX, 0, centerZ)
  const wood = paint(0xf4d7a4)
  const postGeo = new THREE.BoxGeometry(0.08, 1.05, 0.08)
  const railGeo = new THREE.BoxGeometry(0.52, 0.06, 0.045)
  const x0 = 0.2
  const step = 0.52
  const circles = []
  for (let i = 0; i <= 3; i += 1) {
    const post = new THREE.Mesh(postGeo, wood)
    post.position.set(x0 + i * step - centerX, 0.52, 0)
    post.castShadow = true
    group.add(post)
    circles.push({ x: post.position.x, z: 0, r: 0.22 })
    if (i === 3) break
    const railTop = new THREE.Mesh(railGeo, wood)
    railTop.position.set(x0 + step / 2 + i * step - centerX, 0.78, 0)
    const railLow = new THREE.Mesh(railGeo, wood)
    railLow.position.set(x0 + step / 2 + i * step - centerX, 0.32, 0)
    group.add(railTop, railLow)
  }
  group.userData.circles = circles
  return tag(group, 'fence', '栅栏')
}

function makeHay() {
  const group = new THREE.Group()
  const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 10), paint(0xe6b422))
  hay.rotation.z = Math.PI / 2
  hay.position.y = 0.32
  hay.castShadow = true
  group.add(hay)
  group.position.set(-1.15, 0, -3.15)
  group.userData.circles = [{ x: 0, z: 0, r: 0.45 }]
  return tag(group, 'hay', '草垛')
}

function makeFlower(id, x, z, color) {
  const group = new THREE.Group()
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.16, 5), paint(0x3d9a32))
  stem.position.y = 0.08
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), paint(color))
  head.position.y = 0.18
  group.add(stem, head)
  group.position.set(x, 0.02, z)
  return tag(group, id, '花')
}

function makeDirt() {
  const group = new THREE.Group()
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(1.7, 28), paint(0xe0b56a))
  dirt.rotation.x = -Math.PI / 2
  dirt.position.y = 0.012
  dirt.receiveShadow = true
  group.add(dirt)
  return tag(group, 'dirt', '泥地', { allowSink: true })
}

function addRibbon(curve, width, y, material) {
  const steps = 320
  const positions = []
  const uvs = []
  const indices = []
  let walked = 0
  let prev = curve.getPoint(0)
  const marks = [0]
  for (let i = 1; i <= steps; i += 1) {
    const p = curve.getPoint(i / steps)
    walked += p.distanceTo(prev)
    marks.push(walked)
    prev = p
  }
  const total = walked || 1
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const p = curve.getPoint(t)
    const tang = curve.getTangent(t)
    const side = new THREE.Vector3(-tang.z, 0, tang.x)
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0)
    side.normalize()
    const left = p.clone().addScaledVector(side, width / 2)
    const right = p.clone().addScaledVector(side, -width / 2)
    left.y = y
    right.y = y
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
    const v = marks[i] / 3.4
    uvs.push(0, v, 1, v)
  }
  for (let i = 0; i < steps; i += 1) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  void total
  return mesh
}

function makeWaterMap() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1f6eab'
  ctx.fillRect(0, 0, 64, 256)
  ctx.strokeStyle = 'rgba(186, 230, 255, 0.7)'
  ctx.lineWidth = 2
  for (let i = 0; i < 10; i += 1) {
    const y = i * 26
    ctx.beginPath()
    ctx.moveTo(6, y)
    ctx.bezierCurveTo(22, y + 8, 40, y - 6, 58, y + 3)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function creekPoints() {
  return [
    [10.4, 0, -78],
    [7.2, 0, -68],
    [9.8, 0, -58],
    [6.6, 0, -48],
    [7.2, 0, -36],
    [5.4, 0, -28],
    [6.8, 0, -22],
    [4.6, 0, -16],
    [6.2, 0, -12],
    [4.8, 0, -8],
    [5.6, 0, -5],
    [4.2, 0, -2],
    [4.8, 0, 1.2],
    [6.8, 0, 12],
    [4.5, 0, 22],
    [7.1, 0, 32],
    [5.0, 0, 42],
  ].map((p) => new THREE.Vector3(...p))
}

function bridgeAnchor(curve) {
  const anchor = new THREE.Vector3(5.1, 0, -6.4)
  let bridgeT = 0.5
  let nearest = Infinity
  for (let i = 0; i <= 80; i += 1) {
    const t = i / 80
    const dist = curve.getPoint(t).distanceTo(anchor)
    if (dist < nearest) {
      nearest = dist
      bridgeT = t
    }
  }
  return { point: curve.getPoint(bridgeT), tangent: curve.getTangent(bridgeT) }
}

function makeCreek() {
  const curve = new THREE.CatmullRomCurve3(creekPoints())
  const group = new THREE.Group()
  const bankMat = paint(0xc4a06a)
  bankMat.side = THREE.DoubleSide
  const bank = addRibbon(curve, 2.6, 0.02, bankMat)
  const flow = makeWaterMap()
  const waterMat = new THREE.MeshBasicMaterial({
    map: flow,
    color: 0xffffff,
    side: THREE.DoubleSide,
  })
  const water = addRibbon(curve, 1.85, 0.08, waterMat)
  group.add(bank, water)

  const { point: bridgePoint } = bridgeAnchor(curve)
  const rockMat = paint(0x9a8f82)
  const reedMat = paint(0x3d9a32)
  for (let i = 1; i < 28; i += 1) {
    const t = i / 29
    const p = curve.getPoint(t)
    if (p.distanceTo(bridgePoint) < 4.2) continue
    const tang = curve.getTangent(t)
    const side = new THREE.Vector3(-tang.z, 0, tang.x).normalize()
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.04, 0), rockMat)
    rock.position.copy(p).addScaledVector(side, i % 2 ? 1.05 : -1.05)
    rock.position.y = 0.08
    rock.castShadow = true
    group.add(rock)
    if (i % 2 === 0) {
      const reed = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.38, 0.03), reedMat)
      reed.position.copy(p).addScaledVector(side, -1.15)
      reed.position.y = 0.2
      reed.rotation.z = 0.15
      group.add(reed)
    }
  }
  group.userData.curve = curve
  group.userData.flow = flow
  return tag(group, 'creek', '小溪')
}

function makeBridge() {
  const curve = new THREE.CatmullRomCurve3(creekPoints())
  const { point, tangent } = bridgeAnchor(curve)
  const side = new THREE.Vector3(-tangent.z, 0, tangent.x)
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0)
  side.normalize()
  const wood = paint(0xd2b48c)
  const dark = paint(0x8a5a32)
  const bridge = new THREE.Group()
  const span = 2.55
  const deckW = 1.05
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.08, span), wood)
  deck.position.y = 0.28
  deck.castShadow = true
  deck.receiveShadow = true
  const beamGeo = new THREE.BoxGeometry(0.1, 0.1, span + 0.08)
  const beamA = new THREE.Mesh(beamGeo, dark)
  beamA.position.set(deckW / 2 - 0.08, 0.16, 0)
  const beamB = beamA.clone()
  beamB.position.x = -deckW / 2 + 0.08
  const postGeo = new THREE.BoxGeometry(0.08, 0.55, 0.08)
  const railGeo = new THREE.BoxGeometry(0.05, 0.05, span - 0.2)
  for (const sideX of [-1, 1]) {
    for (const end of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, dark)
      post.position.set(sideX * (deckW / 2 - 0.06), 0.52, end * (span / 2 - 0.16))
      post.castShadow = true
      bridge.add(post)
    }
    const rail = new THREE.Mesh(railGeo, wood)
    rail.position.set(sideX * (deckW / 2 - 0.06), 0.74, 0)
    bridge.add(rail)
  }
  bridge.add(deck, beamA, beamB)
  bridge.position.set(point.x, 0, point.z)
  bridge.lookAt(point.x + side.x, 0, point.z + side.z)
  bridge.userData.deckW = deckW
  bridge.userData.span = span
  return tag(bridge, 'bridge', '木桥')
}

function makeMountains() {
  const group = new THREE.Group()
  const peaks = [
    [1.6, -33, 12, 5.2, 0x8ea67c],
    [14.2, -44, 16, 6.4, 0x7f9470],
    [3.2, -62, 15, 6.2, 0x6d825f],
    [15.5, -72, 18, 7.2, 0x75886a],
    [6.4, -88, 20, 8.4, 0x6d825f],
    [13.8, -96, 17, 7, 0x7f9470],
  ]
  for (const [x, z, h, r, color] of peaks) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), paint(color))
    hill.position.set(x, h / 2 - 0.4, z)
    hill.castShadow = true
    group.add(hill)
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.34, h * 0.2, 6), paint(0xf7f8f4))
    snow.position.set(x, h * 0.78, z)
    group.add(snow)
  }
  return tag(group, 'mountains', '远山', { allowSink: true })
}

function makeCloud(id, x, y, z, scale) {
  const group = new THREE.Group()
  const mat = paint(0xffffff)
  const a = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mat)
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat)
  b.position.set(0.34, -0.04, 0)
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mat)
  c.position.set(-0.32, -0.02, 0.02)
  group.add(a, b, c)
  group.position.set(x, y, z)
  group.scale.setScalar(scale)
  return tag(group, id, '云', { floating: true })
}

export function layoutBaseProps(records) {
  const useSaved = Array.isArray(records)
  const kept = []
  for (const obj of createBaseProps()) {
    if (useSaved) {
      const rec = records.find((item) => item.id === obj.userData.baseId)
      if (!rec) continue
      const p = rec.p || [0, 0, 0]
      obj.position.set(p[0] || 0, p[1] || 0, p[2] || 0)
      obj.rotation.y = rec.ry || 0
    }
    kept.push(obj)
  }
  return kept
}

/** Editable props of the starter farm. No generated villages. */
export function createBaseProps() {
  return [
    makeDirt(),
    makeBarn(),
    makeTree('tree-a', 0.2, -6.6, 4.0, 0.7),
    makeTree('tree-b', -1.5, -9.0, 3.4, 0.65),
    makeWindmill(),
    makeFence(),
    makeHay(),
    makeFlower('flower-a', -0.85, 0.72, 0xff6b8a),
    makeFlower('flower-b', 0.78, 0.62, 0xffe566),
    makeFlower('flower-c', -0.55, -0.78, 0xff9a4a),
    makeFlower('flower-d', 0.62, -0.7, 0xffffff),
    makeCreek(),
    makeBridge(),
    makeMountains(),
    makeCloud('cloud-a', -2.4, 8.2, -6.5, 1.25),
    makeCloud('cloud-b', 0.6, 9.0, -9.5, 1),
    makeCloud('cloud-c', -0.8, 7.1, -4.2, 0.85),
  ]
}

export function createEnvironment(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(46, 24, 16),
    new THREE.MeshBasicMaterial({
      map: makeSkyMap(),
      side: THREE.BackSide,
      depthWrite: false,
    }),
  )
  sky.name = 'sky'
  sky.renderOrder = -1
  scene.add(sky)

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(140, 64),
    new THREE.MeshLambertMaterial({ map: makeGrassMap() }),
  )
  grass.name = 'ground'
  grass.rotation.x = -Math.PI / 2
  grass.receiveShadow = true
  scene.add(grass)
  return { sky, grass }
}

const worldPoint = new THREE.Vector3()
const worldQuat = new THREE.Quaternion()
const bridgeDir = new THREE.Vector3()

/** Rebuild creek, bridge and prop collision from the current base objects. */
export function syncBaseWorld(props) {
  removeCollidersBySource('base')
  bridgeZones.length = 0
  setCreekCurve(null)
  setCreekRoot(null)

  for (const obj of props) {
    if (obj.userData.baseId === 'creek' && obj.userData.curve) {
      setCreekCurve(obj.userData.curve)
      setCreekRoot(obj)
    }
    if (obj.userData.baseId === 'bridge') {
      obj.updateMatrixWorld(true)
      obj.getWorldPosition(worldPoint)
      obj.getWorldQuaternion(worldQuat)
      bridgeDir.set(0, 0, 1).applyQuaternion(worldQuat)
      addBridgeZone(
        worldPoint.x,
        worldPoint.z,
        (obj.userData.deckW || 1.05) * 0.7,
        (obj.userData.span || 2.55) * 0.7,
        bridgeDir.x,
        bridgeDir.z,
      )
    }
    const circles = obj.userData.circles || []
    if (!circles.length) continue
    obj.updateMatrixWorld(true)
    for (const c of circles) {
      worldPoint.set(c.x, 0, c.z).applyMatrix4(obj.matrixWorld)
      addCircleCollider(worldPoint.x, worldPoint.z, c.r, false, 'base')
    }
  }
}

export function spinBaseProps(scene, dt) {
  const blades = scene.getObjectByName('windmill')?.userData.blades
  if (blades) blades.rotation.z -= dt * 0.18
  const flow = scene.getObjectByName('creek')?.userData.flow
  if (flow) flow.offset.y = (flow.offset.y - dt * 0.035) % 1
}
