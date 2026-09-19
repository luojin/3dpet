import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const BASE = import.meta.env.BASE_URL

/** Quaternius animals from poly.pizza (CC0). GLBs already embed all clips. */
const PETS = [
  { id: 'cow', name: 'Cow', blurb: '牛', url: `${BASE}models/Cow.glb`, scale: 1 },
  { id: 'deer', name: 'Deer', blurb: '鹿', url: `${BASE}models/Deer.glb`, scale: 1 },
  { id: 'wolf', name: 'Wolf', blurb: '狼', url: `${BASE}models/Wolf.glb`, scale: 1.15 },
  { id: 'shiba', name: 'Shiba Inu', blurb: '柴犬', url: `${BASE}models/ShibaInu.glb`, scale: 0.88 },
  { id: 'husky', name: 'Husky', blurb: '哈士奇', url: `${BASE}models/Husky.glb`, scale: 0.9 },
  { id: 'horse', name: 'Horse', blurb: '马', url: `${BASE}models/Horse.glb`, scale: 0.95 },
  { id: 'stag', name: 'Stag', blurb: '雄鹿', url: `${BASE}models/Stag.glb`, scale: 0.95 },
  { id: 'zebra', name: 'Zebra', blurb: '斑马', url: `${BASE}models/Zebra.glb`, scale: 1 },
  { id: 'pig', name: 'Pig', blurb: '猪', url: `${BASE}models/Pig.glb`, scale: 1.2 },
]

const STORAGE_HUNGER = '3dpet.hunger'
const HUNGER_FULL = 100
const HUNGER_WINDOW_MS = 4 * 60 * 60 * 1000
const FOOD_KIND = {
  cow: 'grass',
  deer: 'grass',
  stag: 'grass',
  horse: 'hay',
  zebra: 'grass',
  pig: 'apple',
  wolf: 'bone',
  shiba: 'bone',
  husky: 'bone',
}
const STORAGE_PET = '3dpet.selectedPet'
const STORAGE_ANIMS = '3dpet.lastAnims'
const STORAGE_VIEWS = '3dpet.views3'

function readLastAnims() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_ANIMS) || '{}') || {}
  } catch {
    return {}
  }
}

function saveLastAnim(petId, clipName) {
  if (!petId || !clipName) return
  const map = readLastAnims()
  map[petId] = prettyAnimName(clipName).toLowerCase()
  localStorage.setItem(STORAGE_ANIMS, JSON.stringify(map))
}

function findActionBySavedName(actionsList, savedKey) {
  if (!savedKey) return null
  return (
    actionsList.find((a) => prettyAnimName(a.getClip().name).toLowerCase() === savedKey) || null
  )
}

const canvas = document.querySelector('#scene')
const statusEl = document.querySelector('#status')
const fullnessEl = document.querySelector('#fullness')
const fullnessMarkEl = document.querySelector('#fullnessMark')
const fullnessValueEl = document.querySelector('#fullnessValue')
const feedBtn = document.querySelector('#feedBtn')
const feedGainEl = document.querySelector('#feedGain')
const settingsEl = document.querySelector('#settings')
const petListEl = document.querySelector('#petList')
const resetViewBtn = document.querySelector('#resetViewBtn')
const closeSettings = document.querySelector('#closeSettings')

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.setClearColor(0x8ecfff, 1)

const scene = new THREE.Scene()

const DEFAULT_TARGET = new THREE.Vector3(1.3, 0.85, -2)
const DEFAULT_CAMERA = new THREE.Vector3(1.1, 3.8, 10.5)

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 200)
camera.position.copy(DEFAULT_CAMERA)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.enablePan = false
controls.minDistance = 2.4
controls.maxDistance = 22
controls.maxPolarAngle = Math.PI * 0.49
controls.target.copy(DEFAULT_TARGET)

scene.add(new THREE.AmbientLight(0xfff8ee, 0.7))
const sun = new THREE.DirectionalLight(0xfff2d2, 1.55)
sun.position.set(4.5, 8, 3)
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
sun.shadow.camera.near = 0.5
sun.shadow.camera.far = 24
sun.shadow.camera.left = -8
sun.shadow.camera.right = 8
sun.shadow.camera.top = 8
sun.shadow.camera.bottom = -8
scene.add(sun)
scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x7dce4a, 0.55))

function paint(color) {
  return new THREE.MeshLambertMaterial({ color })
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

function addBarn(x, z, rotY) {
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
  group.position.set(x, 0, z)
  group.rotation.y = rotY
  scene.add(group)
}

function addTree(x, z, height) {
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
  scene.add(group)
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
  creekFlow = tex
  return tex
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
  return mesh
}

function addBridgeAt(point, tangent) {
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
  scene.add(bridge)
}

function addMountains() {
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
    scene.add(hill)
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.34, h * 0.2, 6), paint(0xf7f8f4))
    snow.position.set(x, h * 0.78, z)
    scene.add(snow)
  }
}

function addCreekAndBridge() {
  const points = [
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
  const curve = new THREE.CatmullRomCurve3(points)
  const bankMat = paint(0xc4a06a)
  bankMat.side = THREE.DoubleSide
  const bank = addRibbon(curve, 2.6, 0.02, bankMat)
  const waterMat = new THREE.MeshBasicMaterial({
    map: makeWaterMap(),
    color: 0xffffff,
    side: THREE.DoubleSide,
  })
  const water = addRibbon(curve, 1.85, 0.08, waterMat)
  scene.add(bank, water)

  const rockMat = paint(0x9a8f82)
  const reedMat = paint(0x3d9a32)
  for (let i = 1; i < 28; i += 1) {
    const t = i / 29
    const p = curve.getPoint(t)
    const tang = curve.getTangent(t)
    const side = new THREE.Vector3(-tang.z, 0, tang.x).normalize()
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.04, 0), rockMat)
    rock.position.copy(p).addScaledVector(side, i % 2 ? 1.05 : -1.05)
    rock.position.y = 0.08
    rock.castShadow = true
    scene.add(rock)
    if (i % 2 === 0) {
      const reed = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.38, 0.03), reedMat)
      reed.position.copy(p).addScaledVector(side, -1.15)
      reed.position.y = 0.2
      reed.rotation.z = 0.15
      scene.add(reed)
    }
  }

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
  addBridgeAt(curve.getPoint(bridgeT), curve.getTangent(bridgeT))
  addMountains()
}

function addFence() {
  const wood = paint(0xf4d7a4)
  const postGeo = new THREE.BoxGeometry(0.08, 1.05, 0.08)
  const railGeo = new THREE.BoxGeometry(0.52, 0.06, 0.045)
  const z = -1.85
  const x0 = 0.2
  const step = 0.52
  for (let i = 0; i <= 3; i += 1) {
    const post = new THREE.Mesh(postGeo, wood)
    post.position.set(x0 + i * step, 0.52, z)
    post.castShadow = true
    scene.add(post)
    if (i === 3) break
    const railTop = new THREE.Mesh(railGeo, wood)
    railTop.position.set(x0 + step / 2 + i * step, 0.78, z)
    const railLow = new THREE.Mesh(railGeo, wood)
    railLow.position.set(x0 + step / 2 + i * step, 0.32, z)
    scene.add(railTop, railLow)
  }
}

function addWindmill(x, z) {
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
  windmillBlades = new THREE.Group()
  windmillBlades.position.set(0, hubY, 0.78)
  const bladeMat = paint(0xfffaf2)
  const bladeGeo = new THREE.BoxGeometry(0.16, 1.45, 0.05)
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), paint(0xe7d7b8))
  windmillBlades.add(hub)
  for (let i = 0; i < 4; i += 1) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.position.y = 0.78
    const pivot = new THREE.Group()
    pivot.rotation.z = (i * Math.PI) / 2
    pivot.add(blade)
    windmillBlades.add(pivot)
  }
  group.add(tower, cap, nacelle, shaft, windmillBlades)
  group.position.set(x, 0, z)
  group.rotation.y = 0.55
  scene.add(group)
}

function addCloud(x, y, z, scale) {
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
  scene.add(group)
}

let skyDome = null
let windmillBlades = null
let creekFlow = null

function buildFarm() {
  skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(46, 24, 16),
    new THREE.MeshBasicMaterial({
      map: makeSkyMap(),
      side: THREE.BackSide,
      depthWrite: false,
    }),
  )
  skyDome.renderOrder = -1
  scene.add(skyDome)

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(140, 64),
    new THREE.MeshLambertMaterial({ map: makeGrassMap() }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.receiveShadow = true
  scene.add(grass)

  const dirt = new THREE.Mesh(new THREE.CircleGeometry(1.7, 28), paint(0xe0b56a))
  dirt.rotation.x = -Math.PI / 2
  dirt.position.y = 0.012
  dirt.receiveShadow = true
  scene.add(dirt)

  addBarn(-2.7, -5.1, 0.35)
  addTree(0.2, -6.6, 4.0)
  addTree(-1.5, -9.0, 3.4)
  addWindmill(3.4, -10.6)
  addFence()
  const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 10), paint(0xe6b422))
  hay.rotation.z = Math.PI / 2
  hay.position.set(-1.15, 0.32, -3.15)
  hay.castShadow = true
  scene.add(hay)
  const flowers = [
    [-0.85, 0.72, 0xff6b8a],
    [0.78, 0.62, 0xffe566],
    [-0.55, -0.78, 0xff9a4a],
    [0.62, -0.7, 0xffffff],
  ]
  for (const [x, z, color] of flowers) {
    const flower = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.16, 5), paint(0x3d9a32))
    stem.position.y = 0.08
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), paint(color))
    head.position.y = 0.18
    flower.add(stem, head)
    flower.position.set(x, 0.02, z)
    scene.add(flower)
  }
  addCreekAndBridge()
  addCloud(-2.4, 8.2, -6.5, 1.25)
  addCloud(0.6, 9.0, -9.5, 1)
  addCloud(-0.8, 7.1, -4.2, 0.85)
}

buildFarm()

const loader = new GLTFLoader()
const clock = new THREE.Clock()

let mixer = null
let actions = []
let currentAction = null
let currentPet = null
let petRoot = null
let dragMoved = false
let loadStatus = 'idle'
let requestedPet = null
let suppressViewSave = false
let viewSaveTimer = 0
let eatAction = null
let busy = null
let foodMesh = null
let pendingGain = null
const pointer = { x: 0, y: 0 }
const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()

function prettyAnimName(name) {
  return name
    .replace(/^(AnimalArmature\|)+/g, '')
    .replace(/^(Armature\|)+/g, '')
    .replace(/\|+/g, ' · ')
    .replace(/_/g, ' ')
}

function isDeathClip(name) {
  return /death/i.test(prettyAnimName(name))
}

function pickUniqueAnims(animations) {
  const seen = new Set()
  const unique = []
  for (const clip of animations) {
    if (isDeathClip(clip.name)) continue
    const key = prettyAnimName(clip.name).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(clip)
  }
  return unique
}

function isIdleName(name) {
  return /idle/i.test(name) && !/hit|react|jump/i.test(name)
}

function isEatName(name) {
  return /eat/i.test(name)
}

function idleActions() {
  return actions.filter((action) => isIdleName(action.getClip().name))
}

function playClip(action, { fade = 0.25, loop = true } = {}) {
  if (!action) return
  action.enabled = true
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
  action.clampWhenFinished = !loop
  if (currentAction && currentAction !== action) currentAction.fadeOut(fade)
  action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play()
  currentAction = action
}

function playIdle(fade = 0.3) {
  const pool = idleActions()
  if (!pool.length) return
  const next = pool[Math.floor(Math.random() * pool.length)]
  playClip(next, { fade, loop: true })
}

function playTrick() {
  if (busy) return
  const pool = actions.filter((action) => {
    const name = action.getClip().name
    return !isIdleName(name) && !isEatName(name)
  })
  if (!pool.length) {
    playIdle(0.2)
    return
  }
  busy = 'trick'
  const next = pool[Math.floor(Math.random() * pool.length)]
  playClip(next, { fade: 0.12, loop: false })
}

function onMixerFinished(event) {
  if (event.action !== currentAction) return
  if (busy === 'feed') {
    removeFood()
    busy = null
    playIdle(0.25)
    const petId = currentPet?.id
    if (petId) {
      const room = HUNGER_FULL - hungerOf(petId)
      if (room > 0) showGain(petId, room > 10 ? 10 : room)
    }
    refreshFeedButton()
    return
  }
  if (busy === 'trick') {
    busy = null
    playIdle(0.2)
  }
}

function onMixerLoop(event) {
  if (busy || event.action !== currentAction) return
  if (!isIdleName(event.action.getClip().name)) return
  const pool = idleActions().filter((action) => action !== event.action)
  if (!pool.length) return
  playClip(pool[Math.floor(Math.random() * pool.length)], { fade: 0.35, loop: true })
}

function disposeMaterial(material) {
  if (!material) return
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose()
  }
  material.dispose?.()
}

function disposeRoot(root) {
  if (!root) return
  root.traverse((obj) => {
    if (obj.isSkinnedMesh) obj.skeleton?.dispose()
    if (!obj.isMesh) return
    obj.geometry?.dispose()
    if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial)
    else disposeMaterial(obj.material)
  })
}

function clearPet() {
  mixer?.stopAllAction()
  removeFood()
  if (petRoot) {
    scene.remove(petRoot)
    disposeRoot(petRoot)
  }
  petRoot = null
  mixer = null
  actions = []
  currentAction = null
  eatAction = null
  busy = null
}

/** Place pet so mesh feet sit on y=0 (ignore bones / empty helpers). */
function framePet(root, preferredScale) {
  root.position.set(0, 0, 0)
  root.rotation.set(0, 0, 0)
  root.scale.setScalar(1)

  const meshBox = new THREE.Box3()
  let hasMesh = false
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    if (!obj.isMesh) return
    const b = new THREE.Box3().setFromObject(obj)
    if (!hasMesh) {
      meshBox.copy(b)
      hasMesh = true
    } else {
      meshBox.union(b)
    }
  })
  if (!hasMesh) meshBox.setFromObject(root)

  const size = meshBox.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = (1.55 / maxDim) * preferredScale
  root.scale.setScalar(scale)
  root.updateMatrixWorld(true)

  const scaled = new THREE.Box3()
  hasMesh = false
  root.traverse((obj) => {
    if (!obj.isMesh) return
    const b = new THREE.Box3().setFromObject(obj)
    if (!hasMesh) {
      scaled.copy(b)
      hasMesh = true
    } else {
      scaled.union(b)
    }
  })
  if (!hasMesh) scaled.setFromObject(root)

  const center = scaled.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= scaled.min.y
  root.position.y += 0.03

  suppressViewSave = true
  controls.target.copy(DEFAULT_TARGET)
  camera.position.copy(DEFAULT_CAMERA)
  controls.update()
  suppressViewSave = false
}

function readViews() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_VIEWS) || '{}') || {}
  } catch {
    return {}
  }
}

function saveView(petId) {
  if (!petId) return
  const map = readViews()
  map[petId] = {
    dist: controls.getDistance(),
    az: controls.getAzimuthalAngle(),
    pol: controls.getPolarAngle(),
  }
  localStorage.setItem(STORAGE_VIEWS, JSON.stringify(map))
}

function scheduleSaveView() {
  if (suppressViewSave || loadStatus !== 'ready' || !currentPet) return
  window.clearTimeout(viewSaveTimer)
  viewSaveTimer = window.setTimeout(() => {
    if (currentPet) saveView(currentPet.id)
  }, 180)
}

function applySavedView(petId) {
  const saved = readViews()[petId]
  if (!saved) return
  const dist = Number(saved.dist)
  const az = Number(saved.az)
  const pol = Number(saved.pol)
  if (![dist, az, pol].every(Number.isFinite)) return
  const radius = Math.min(controls.maxDistance, Math.max(controls.minDistance, dist))
  const phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, pol))
  suppressViewSave = true
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, phi, az)))
  controls.update()
  suppressViewSave = false
}

function resetAllViews() {
  localStorage.removeItem(STORAGE_VIEWS)
  suppressViewSave = true
  controls.target.copy(DEFAULT_TARGET)
  camera.position.copy(DEFAULT_CAMERA)
  controls.update()
  suppressViewSave = false
  settingsEl.hidden = true
}

controls.addEventListener('change', scheduleSaveView)
window.addEventListener('pagehide', () => {
  if (loadStatus === 'ready' && currentPet) saveView(currentPet.id)
})

const GLB_MAGIC = 0x46546c67
let loadToken = 0

function glbLength(buffer) {
  if (buffer.byteLength < 12) return -1
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== GLB_MAGIC) return -1
  return view.getUint32(8, true)
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function fetchArrayBuffer(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.responseType = 'arraybuffer'
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) resolve(xhr.response)
      else reject(new Error(`模型下载失败 (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('模型下载失败'))
    xhr.send()
  })
}

const MODEL_CACHE = '3dpet-models-v1'
const memoryModels = new Map()

async function openModelCache() {
  if (!('caches' in window)) return null
  try {
    return await caches.open(MODEL_CACHE)
  } catch {
    return null
  }
}

async function clearModelCache(url) {
  memoryModels.delete(url)
  const cache = await openModelCache()
  if (cache) await cache.delete(url)
}

async function readCachedModel(url) {
  const mem = memoryModels.get(url)
  if (mem && glbLength(mem) === mem.byteLength) return mem
  const cache = await openModelCache()
  if (!cache) return null
  const hit = await cache.match(url)
  if (!hit) return null
  const buffer = await hit.arrayBuffer()
  if (glbLength(buffer) !== buffer.byteLength) {
    await cache.delete(url)
    memoryModels.delete(url)
    return null
  }
  memoryModels.set(url, buffer)
  return buffer
}

async function storeModel(url, buffer) {
  memoryModels.set(url, buffer)
  try {
    const cache = await openModelCache()
    if (!cache) return
    await cache.put(
      url,
      new Response(buffer.slice(0), {
        headers: {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': String(buffer.byteLength),
        },
      }),
    )
    const stored = await cache.match(url)
    const check = stored ? await stored.arrayBuffer() : null
    if (!check || glbLength(check) !== check.byteLength) await cache.delete(url)
  } catch (err) {
    console.warn('model cache skipped', err)
  }
}

async function fetchModel(url, { purge = false } = {}) {
  if (purge) await clearModelCache(url)
  else {
    const cached = await readCachedModel(url)
    if (cached) return cached
  }

  let lastError = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await delay(280 * attempt)
    const bust = attempt === 0 && !purge ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${Date.now()}`
    try {
      const buffer =
        attempt % 2 === 0
          ? await fetch(bust, { cache: purge || attempt > 0 ? 'reload' : 'default' }).then(async (res) => {
              if (!res.ok) throw new Error(`模型下载失败 (${res.status})`)
              return res.arrayBuffer()
            })
          : await fetchArrayBuffer(bust)
      if (glbLength(buffer) === buffer.byteLength) {
        await storeModel(url, buffer)
        return buffer
      }
      lastError = new Error('模型文件不完整')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('模型文件不完整')
}

function parseModel(buffer, url) {
  const path = url.slice(0, url.lastIndexOf('/') + 1)
  return new Promise((resolve, reject) => {
    loader.parse(buffer, path, resolve, reject)
  })
}

function setStatus(text) {
  statusEl.hidden = !text
  statusEl.textContent = text || ''
}

function readHungerMap() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_HUNGER) || '{}') || {}
  } catch {
    return {}
  }
}

function writeHungerMap(map) {
  localStorage.setItem(STORAGE_HUNGER, JSON.stringify(map))
}

function hungerOf(petId) {
  if (!petId) return HUNGER_FULL
  if (currentPet && currentPet.id === petId && !eatAction) return HUNGER_FULL
  const row = readHungerMap()[petId]
  if (!row || !Number.isFinite(row.value) || !Number.isFinite(row.at)) return HUNGER_FULL
  const dropped = ((Date.now() - row.at) / HUNGER_WINDOW_MS) * HUNGER_FULL
  return Math.max(0, Math.min(HUNGER_FULL, row.value - dropped))
}

function ensureHunger(petId) {
  const map = readHungerMap()
  if (map[petId]) return
  map[petId] = { value: HUNGER_FULL, at: Date.now() }
  writeHungerMap(map)
}

function commitHunger(petId, value) {
  const map = readHungerMap()
  map[petId] = { value: Math.max(0, Math.min(HUNGER_FULL, value)), at: Date.now() }
  writeHungerMap(map)
}

function updateFullness() {
  const show = loadStatus === 'ready' && !!currentPet
  fullnessEl.hidden = !show
  if (!show) return
  const name = currentPet.blurb || currentPet.name
  fullnessMarkEl.textContent = name
  fullnessMarkEl.classList.toggle('wide', [...name].length > 1)
  fullnessValueEl.textContent = String(Math.floor(hungerOf(currentPet.id)))
  refreshFeedButton()
}

function refreshFeedButton() {
  const canShow = loadStatus === 'ready' && eatAction && currentPet && hungerOf(currentPet.id) < HUNGER_FULL
  feedBtn.hidden = !canShow
  feedBtn.disabled = busy === 'feed' || !!pendingGain
}

function flushGain() {
  if (!pendingGain) return
  const { petId, amount } = pendingGain
  pendingGain = null
  feedGainEl.hidden = true
  feedGainEl.classList.remove('play')
  commitHunger(petId, hungerOf(petId) + amount)
  updateFullness()
}

function showGain(petId, amount) {
  pendingGain = { petId, amount }
  const shown = Math.round(amount * 10) / 10
  feedGainEl.textContent = `+${Number.isInteger(shown) ? shown : shown.toFixed(1)}`
  feedGainEl.hidden = false
  feedGainEl.classList.remove('play')
  void feedGainEl.offsetWidth
  feedGainEl.classList.add('play')
}

feedGainEl.addEventListener('animationend', (event) => {
  if (event.animationName !== 'feed-gain') return
  flushGain()
})

function makeBone() {
  const group = new THREE.Group()
  const mat = paint(0xf3e2c4)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.11, 8), mat)
  shaft.rotation.z = Math.PI / 2
  const knobGeo = new THREE.SphereGeometry(0.024, 8, 6)
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const knob = new THREE.Mesh(knobGeo, mat)
      knob.position.set(end * 0.056, side * 0.016, 0)
      group.add(knob)
    }
  }
  group.add(shaft)
  return group
}

function makeFood(kind) {
  const group = new THREE.Group()
  if (kind === 'bone') {
    const spots = [
      [-0.18, 0.025, -0.06, 0.35],
      [0.02, 0.025, 0.1, -0.8],
      [0.2, 0.025, -0.02, 1.15],
    ]
    for (const [x, y, z, rot] of spots) {
      const bone = makeBone()
      bone.position.set(x, y, z)
      bone.rotation.y = rot
      group.add(bone)
    }
    return group
  }
  if (kind === 'hay') {
    const straw = paint(0xe6b422)
    for (let i = 0; i < 9; i += 1) {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.012), straw)
      stalk.position.set((i - 4) * 0.018, 0.055, (i % 3) * 0.012)
      stalk.rotation.z = (i - 4) * 0.12
      group.add(stalk)
    }
    return group
  }
  if (kind === 'apple') {
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), paint(0xe24b3a))
    apple.position.y = 0.06
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), paint(0x3aaa34))
    leaf.position.set(0.02, 0.11, 0)
    group.add(apple, leaf)
    return group
  }
  const colors = [paint(0x2c8a28), paint(0x4eaa32), paint(0x8ed85a)]
  for (let i = 0; i < 26; i += 1) {
    const height = 0.09 + (i % 5) * 0.02
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, height, 0.006), colors[i % 3])
    const ang = (i / 26) * Math.PI * 2
    const rad = 0.03 + (i % 4) * 0.04
    blade.position.set(Math.cos(ang) * rad, height / 2, Math.sin(ang) * rad * 0.7)
    blade.rotation.z = ((i % 5) - 2) * 0.2
    blade.rotation.y = ang
    group.add(blade)
  }
  return group
}

function removeFood() {
  if (!foodMesh) return
  foodMesh.parent?.remove(foodMesh)
  disposeRoot(foodMesh)
  foodMesh = null
}

function attachFood(kind) {
  removeFood()
  const food = makeFood(kind)
  food.position.set(0.02, 0.02, 0.52)
  scene.add(food)
  foodMesh = food
}

function startFeed() {
  if (busy === 'feed' || pendingGain || loadStatus !== 'ready' || !eatAction || !currentPet) return
  if (hungerOf(currentPet.id) >= HUNGER_FULL) return
  busy = 'feed'
  attachFood(FOOD_KIND[currentPet.id] || 'grass')
  playClip(eatAction, { fade: 0.12, loop: false })
  refreshFeedButton()
}

function hitPet(clientX, clientY) {
  if (!petRoot) return false
  const rect = canvas.getBoundingClientRect()
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointerNdc, camera)
  return raycaster.intersectObject(petRoot, true).length > 0
}

feedBtn.addEventListener('click', (event) => {
  event.stopPropagation()
  startFeed()
})

async function loadPet(pet) {
  const token = ++loadToken
  const purgeFailed = loadStatus === 'error' && requestedPet?.url === pet.url
  if (loadStatus === 'ready' && currentPet && currentPet.id !== pet.id) saveView(currentPet.id)
  requestedPet = pet
  loadStatus = 'loading'
  setStatus('加载中…')
  fullnessEl.hidden = true
  feedBtn.hidden = true
  clearPet()

  let gltf
  try {
    const buffer = await fetchModel(pet.url, { purge: purgeFailed })
    if (token !== loadToken) return
    gltf = await parseModel(buffer.slice(0), pet.url)
  } catch (err) {
    if (token !== loadToken) return
    console.error(err)
    loadStatus = 'error'
    setStatus('加载失败，点一下重试')
    fullnessEl.hidden = true
    feedBtn.hidden = true
    return
  }
  if (token !== loadToken) {
    disposeRoot(gltf.scene)
    return
  }
  const root = gltf.scene
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  framePet(root, pet.scale)
  applySavedView(pet.id)
  scene.add(root)
  petRoot = root
  currentPet = pet
  loadStatus = 'ready'
  localStorage.setItem(STORAGE_PET, pet.id)
  setStatus('')
  renderPetList()

  const clips = pickUniqueAnims(gltf.animations || [])
  mixer = new THREE.AnimationMixer(root)
  mixer.addEventListener('finished', onMixerFinished)
  mixer.addEventListener('loop', onMixerLoop)
  actions = clips.map((clip) => mixer.clipAction(clip))
  eatAction = actions.find((action) => isEatName(action.getClip().name)) || null
  ensureHunger(pet.id)
  playIdle(0)
  updateFullness()
}

function renderPetList() {
  petListEl.innerHTML = ''
  for (const pet of PETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `pet-card${currentPet?.id === pet.id ? ' active' : ''}`
    btn.innerHTML = `
      <div>
        <strong>${pet.name}</strong>
        <span>${pet.blurb} · Quaternius / poly.pizza</span>
      </div>
      <div class="badge">${currentPet?.id === pet.id ? '使用中' : '选择'}</div>
    `
    btn.addEventListener('click', async () => {
      if (currentPet?.id === pet.id && loadStatus === 'ready') {
        settingsEl.hidden = true
        return
      }
      await loadPet(pet)
      if (loadStatus === 'ready' && requestedPet?.id === pet.id) settingsEl.hidden = true
    })
    petListEl.append(btn)
  }
}

fullnessEl.addEventListener('click', (e) => {
  e.stopPropagation()
  settingsEl.hidden = false
})
resetViewBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  resetAllViews()
})
closeSettings.addEventListener('click', (e) => {
  e.stopPropagation()
  settingsEl.hidden = true
})
settingsEl.addEventListener('click', (e) => {
  if (e.target === settingsEl) settingsEl.hidden = true
})

canvas.addEventListener('pointerdown', (e) => {
  dragMoved = false
  pointer.x = e.clientX
  pointer.y = e.clientY
})
canvas.addEventListener('pointermove', (e) => {
  if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 6) dragMoved = true
})
canvas.addEventListener('pointerup', (e) => {
  if (settingsEl.hidden === false) return
  if (dragMoved) return
  if (e.button !== 0) return
  if (loadStatus === 'loading') return
  if (loadStatus !== 'ready') {
    const pet = requestedPet || currentPet
    if (pet) loadPet(pet)
    return
  }
  if (hitPet(e.clientX, e.clientY)) playTrick()
})

function viewportSize() {
  const view = window.visualViewport
  return {
    width: Math.round(view?.width || window.innerWidth),
    height: Math.round(view?.height || window.innerHeight),
  }
}

function resize() {
  const { width, height } = viewportSize()
  camera.aspect = width / Math.max(height, 1)
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

window.addEventListener('resize', resize)
window.visualViewport?.addEventListener('resize', resize)
resize()

function tick() {
  const dt = clock.getDelta()
  if (windmillBlades) windmillBlades.rotation.z -= dt * 0.18
  if (creekFlow) creekFlow.offset.y = (creekFlow.offset.y - dt * 0.035) % 1
  if (skyDome) {
    skyDome.position.x = camera.position.x
    skyDome.position.z = camera.position.z
  }
  mixer?.update(dt)
  controls.update()
  if (loadStatus === 'ready') updateFullness()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (navigator.serviceWorker.controller) {
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch((err) => {
      console.warn('SW register failed', err)
    })
  })
}

async function boot() {
  registerServiceWorker()
  renderPetList()
  const saved = localStorage.getItem(STORAGE_PET)
  const initial = PETS.find((p) => p.id === saved) || PETS.find((p) => p.id === 'shiba') || PETS[0]
  await loadPet(initial)
  tick()
}

boot()
