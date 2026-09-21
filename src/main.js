import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  tryMove,
  onBridge,
  canStandAt,
  colliders,
  resetWorldCollision,
  PET_RADIUS,
} from './world.js'
import { actorFromObject, clearLiveScene, mountLiveScene, resolvePlayScene, updatePlacedActors, writeLiveScene } from './sceneProps.js'
import { createEnvironment, layoutBaseProps, spinBaseProps, syncBaseWorld } from './baseScene.js'

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
const openEditorBtn = document.querySelector('#openEditorBtn')
const importSceneBtn = document.querySelector('#importSceneBtn')
const clearSceneBtn = document.querySelector('#clearSceneBtn')
const sceneFileInput = document.querySelector('#sceneFile')
const closeSettings = document.querySelector('#closeSettings')
const joystickEl = document.querySelector('#joystick')
const joystickKnobEl = document.querySelector('#joystickKnob')

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
controls.maxDistance = 85
controls.maxPolarAngle = Math.PI * 0.49
controls.target.copy(DEFAULT_TARGET)

scene.add(new THREE.AmbientLight(0xfff8ee, 0.7))
const sun = new THREE.DirectionalLight(0xfff2d2, 1.55)
sun.position.set(4.5, 8, 3)
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
sun.shadow.camera.near = 0.5
sun.shadow.camera.far = 120
sun.shadow.camera.left = -55
sun.shadow.camera.right = 55
sun.shadow.camera.top = 55
sun.shadow.camera.bottom = -55
scene.add(sun)
scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x7dce4a, 0.55))

function paint(color) {
  return new THREE.MeshLambertMaterial({ color })
}

let skyDome = null

function placeBaseProps(layout) {
  const kept = layoutBaseProps(layout)
  for (const obj of kept) scene.add(obj)
  syncBaseWorld(kept)
  return kept
}

resetWorldCollision()
skyDome = createEnvironment(scene).sky

const loader = new GLTFLoader()
resolvePlayScene()
  .then(async (data) => {
    placeBaseProps(data?.version >= 2 ? data.bases : null)
    if (data?.items?.length) await mountLiveScene(scene, data)
  })
  .catch((err) => {
    console.warn('play scene', err)
    placeBaseProps(null)
  })
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
let petFootY = 0.03
const petSpawn = { x: 0, z: 0, rotY: 0 }
const stick = { active: false, x: 0, y: 0, pointerId: null }
const followCam = {
  offset: new THREE.Vector3(),
  targetOffset: new THREE.Vector3(),
  ready: false,
}
const WALK_SPEED = 2.15
const tmpForward = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
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

function isWalkName(name) {
  return /walk|run|gallop/i.test(prettyAnimName(name))
}

function walkActions() {
  const preferred = actions.filter((action) => {
    const n = prettyAnimName(action.getClip().name).toLowerCase()
    return n === 'walk' || n === 'walkslow'
  })
  if (preferred.length) return preferred
  return actions.filter((action) => {
    const n = prettyAnimName(action.getClip().name).toLowerCase()
    return n === 'run' || n === 'gallop' || /walk|run|gallop/i.test(n)
  })
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

function playWalk(fade = 0.15) {
  const pool = walkActions()
  if (!pool.length) return false
  const currentName = currentAction ? prettyAnimName(currentAction.getClip().name).toLowerCase() : ''
  if (currentAction && (currentName === 'walk' || currentName === 'walkslow' || currentName === 'run' || currentName === 'gallop')) {
    return true
  }
  playClip(pool[0], { fade, loop: true })
  return true
}

function playTrick() {
  if (busy || stick.active) return
  const pool = actions.filter((action) => {
    const name = action.getClip().name
    return !isIdleName(name) && !isEatName(name) && !isWalkName(name)
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
  if (busy || stick.active || event.action !== currentAction) return
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
  petFootY = root.position.y
  petSpawn.x = root.position.x
  petSpawn.z = root.position.z
  petSpawn.rotY = root.rotation.y
  unstickPet(root)

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

function unstickPet(root) {
  if (!root || canStandAt(root.position.x, root.position.z)) return
  for (let ring = 1; ring <= 28; ring += 1) {
    for (let step = 0; step < 16; step += 1) {
      const ang = (step / 16) * Math.PI * 2
      const x = Math.cos(ang) * ring * 1.15
      const z = Math.sin(ang) * ring * 1.15
      if (!canStandAt(x, z)) continue
      root.position.x = x
      root.position.z = z
      petSpawn.x = x
      petSpawn.z = z
      return
    }
  }
}

function resetAllViews() {
  localStorage.removeItem(STORAGE_VIEWS)
  if (stick.active) {
    stick.active = false
    stick.pointerId = null
    stick.x = 0
    stick.y = 0
    if (joystickKnobEl) joystickKnobEl.style.transform = 'translate(0px, 0px)'
  }
  if (petRoot) {
    petRoot.position.set(petSpawn.x, petFootY, petSpawn.z)
    petRoot.rotation.y = petSpawn.rotY
  }
  suppressViewSave = true
  controls.target.copy(DEFAULT_TARGET)
  camera.position.copy(DEFAULT_CAMERA)
  controls.update()
  suppressViewSave = false
  if (petRoot) captureFollowOffset()
  settingsEl.hidden = true
}

controls.addEventListener('change', () => {
  scheduleSaveView()
  if (!stick.active) captureFollowOffset()
})
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

function hungerShown(petId) {
  return Math.min(HUNGER_FULL, Math.ceil(hungerOf(petId)))
}

function canFeed() {
  return loadStatus === 'ready' && !!eatAction && !!currentPet && hungerShown(currentPet.id) < HUNGER_FULL
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
  fullnessValueEl.textContent = String(hungerShown(currentPet.id))
  refreshFeedButton()
}

function refreshFeedButton() {
  const allowed = canFeed()
  feedBtn.hidden = !allowed
  feedBtn.disabled = !allowed || busy === 'feed' || !!pendingGain
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
  const ox = petRoot?.position.x || 0
  const oz = petRoot?.position.z || 0
  const yaw = petRoot?.rotation.y || 0
  food.position.set(
    ox + Math.sin(yaw) * 0.52,
    (petRoot?.position.y || 0) + 0.02,
    oz + Math.cos(yaw) * 0.52,
  )
  scene.add(food)
  foodMesh = food
}

function startFeed() {
  if (busy === 'feed' || pendingGain || stick.active || !canFeed()) return
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
openEditorBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  window.location.href = `${import.meta.env.BASE_URL}editor.html`
})
importSceneBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  sceneFileInput?.click()
})
sceneFileInput?.addEventListener('change', async () => {
  const file = sceneFileInput.files?.[0]
  sceneFileInput.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!data || !Array.isArray(data.items)) throw new Error('bad scene')
    writeLiveScene(data)
    window.location.reload()
  } catch {
    window.alert('这个文件不是场景 json')
  }
})
clearSceneBtn?.addEventListener('click', (e) => {
  e.stopPropagation()
  clearLiveScene()
  window.location.reload()
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
  const rect = canvas.getBoundingClientRect()
  pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointerNdc, camera)
  const hits = raycaster.intersectObjects(scene.children, true)
  for (const hit of hits) {
    const actor = actorFromObject(hit.object)
    if (!actor) continue
    actor.playTrick()
    return
  }
  if (hitPet(e.clientX, e.clientY)) playTrick()
})

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

function viewportSize() {
  const standalone = isStandalone()
  document.documentElement.classList.toggle('standalone', standalone)
  let width = window.innerWidth
  let height = window.innerHeight
  if (!standalone && window.visualViewport) {
    width = window.visualViewport.width
    height = window.visualViewport.height
  }
  if (standalone) {
    const portrait = height >= width
    const longSide = Math.max(window.screen.width, window.screen.height)
    const shortSide = Math.min(window.screen.width, window.screen.height)
    const screenH = portrait ? longSide : shortSide
    const screenW = portrait ? shortSide : longSide
    if (screenH > height && screenH - height < 180) height = screenH
    if (screenW > width && screenW - width < 80) width = screenW
    const px = `${Math.round(height)}px`
    document.documentElement.style.height = px
    document.body.style.height = px
    const app = document.querySelector('#app')
    if (app) app.style.height = px
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
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

function setStickFromEvent(event) {
  if (!joystickEl) return
  const rect = joystickEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const max = rect.width * 0.34
  let dx = event.clientX - cx
  let dy = event.clientY - cy
  const len = Math.hypot(dx, dy) || 1
  if (len > max) {
    dx = (dx / len) * max
    dy = (dy / len) * max
  }
  stick.x = dx / max
  stick.y = -dy / max
  if (joystickKnobEl) {
    joystickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`
  }
}

function captureFollowOffset() {
  if (!petRoot) return
  followCam.offset.copy(camera.position).sub(petRoot.position)
  followCam.targetOffset.copy(controls.target).sub(petRoot.position)
  followCam.ready = true
}

function applyFollowCamera() {
  if (!stick.active || !petRoot || !followCam.ready) return
  camera.position.copy(petRoot.position).add(followCam.offset)
  controls.target.copy(petRoot.position).add(followCam.targetOffset)
  suppressViewSave = true
  controls.update()
  suppressViewSave = false
}

function endStick() {
  stick.active = false
  stick.pointerId = null
  stick.x = 0
  stick.y = 0
  controls.enableRotate = true
  controls.enableZoom = true
  if (joystickKnobEl) joystickKnobEl.style.transform = 'translate(0px, 0px)'
  if (loadStatus === 'ready' && busy !== 'feed' && busy !== 'trick' && petRoot) {
    playIdle(0.2)
  }
  scheduleSaveView()
}

if (joystickEl) {
  joystickEl.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    stick.active = true
    stick.pointerId = event.pointerId
    captureFollowOffset()
    controls.enableRotate = false
    controls.enableZoom = false
    joystickEl.setPointerCapture?.(event.pointerId)
    setStickFromEvent(event)
  })
  joystickEl.addEventListener('pointermove', (event) => {
    if (!stick.active || stick.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    setStickFromEvent(event)
  })
  const stop = (event) => {
    if (stick.pointerId !== null && event.pointerId !== stick.pointerId) return
    endStick()
  }
  joystickEl.addEventListener('pointerup', stop)
  joystickEl.addEventListener('pointercancel', stop)
}

function updatePetMovement(dt) {
  if (!petRoot || loadStatus !== 'ready') return
  if (busy === 'feed' || busy === 'trick') return
  const mag = Math.hypot(stick.x, stick.y)
  if (!stick.active || mag < 0.18) {
    if (stick.active && mag < 0.18 && currentAction && isWalkName(currentAction.getClip().name)) {
      playIdle(0.2)
    }
    return
  }

  camera.getWorldDirection(tmpForward)
  tmpForward.y = 0
  if (tmpForward.lengthSq() < 1e-6) tmpForward.set(0, 0, -1)
  else tmpForward.normalize()
  tmpRight.set(-tmpForward.z, 0, tmpForward.x)

  const wishX = tmpRight.x * stick.x + tmpForward.x * stick.y
  const wishZ = tmpRight.z * stick.x + tmpForward.z * stick.y
  const wishLen = Math.hypot(wishX, wishZ) || 1
  const dirX = wishX / wishLen
  const dirZ = wishZ / wishLen
  const speed = WALK_SPEED * Math.min(1, mag)
  const next = tryMove(petRoot.position.x, petRoot.position.z, dirX * speed * dt, dirZ * speed * dt, PET_RADIUS)
  petRoot.position.x = next.x
  petRoot.position.z = next.z
  petRoot.position.y = petFootY + (onBridge(next.x, next.z) ? 0.28 : 0)
  petRoot.rotation.y = Math.atan2(dirX, dirZ)
  playWalk(0.12)
  applyFollowCamera()
}

function tick() {
  const dt = Math.min(0.05, clock.getDelta())
  spinBaseProps(scene, dt)
  if (skyDome) {
    skyDome.position.x = camera.position.x
    skyDome.position.z = camera.position.z
  }
  updatePetMovement(dt)
  if (stick.active) applyFollowCamera()
  mixer?.update(dt)
  updatePlacedActors(dt)
  if (!stick.active) controls.update()
  if (loadStatus === 'ready') updateFullness()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations?.().then((regs) => {
      for (const reg of regs) reg.unregister()
    })
    return
  }
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
  if (import.meta.env.DEV) {
    window.__3dpet = {
      pet: () => petRoot,
      colliders: () => colliders,
      canStandAt,
      onBridge,
      stick,
      camera,
      controls,
      captureFollowOffset,
    }
  }
  const saved = localStorage.getItem(STORAGE_PET)
  const initial = PETS.find((p) => p.id === saved) || PETS.find((p) => p.id === 'shiba') || PETS[0]
  await loadPet(initial)
  tick()
}

boot()
