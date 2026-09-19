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
  { id: 'shiba', name: 'Shiba Inu', blurb: '柴犬', url: `${BASE}models/ShibaInu.glb`, scale: 1.35 },
  { id: 'husky', name: 'Husky', blurb: '哈士奇', url: `${BASE}models/Husky.glb`, scale: 1.1 },
  { id: 'horse', name: 'Horse', blurb: '马', url: `${BASE}models/Horse.glb`, scale: 0.95 },
  { id: 'stag', name: 'Stag', blurb: '雄鹿', url: `${BASE}models/Stag.glb`, scale: 0.95 },
  { id: 'zebra', name: 'Zebra', blurb: '斑马', url: `${BASE}models/Zebra.glb`, scale: 1 },
  { id: 'pig', name: 'Pig', blurb: '猪', url: `${BASE}models/Pig.glb`, scale: 1.2 },
]

const STORAGE_PET = '3dpet.selectedPet'
const STORAGE_ANIMS = '3dpet.lastAnims'

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
const petNameEl = document.querySelector('#petName')
const animNameEl = document.querySelector('#animName')
const settingsEl = document.querySelector('#settings')
const petListEl = document.querySelector('#petList')
const settingsBtn = document.querySelector('#settingsBtn')
const closeSettings = document.querySelector('#closeSettings')

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
)
camera.position.set(2.6, 1.8, 3.6)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.enablePan = false
controls.minDistance = 1.8
controls.maxDistance = 9
controls.maxPolarAngle = Math.PI * 0.49
controls.target.set(0, 0.7, 0)

scene.add(new THREE.AmbientLight(0xfff4e6, 0.85))
const sun = new THREE.DirectionalLight(0xffffff, 1.35)
sun.position.set(3.5, 6, 2.5)
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
scene.add(sun)
scene.add(new THREE.HemisphereLight(0xb8e4ff, 0xf3c98b, 0.55))

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(5, 64),
  new THREE.MeshStandardMaterial({
    color: 0xfff8ef,
    roughness: 0.92,
    metalness: 0,
  }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = 0
ground.receiveShadow = true
scene.add(ground)

const loader = new GLTFLoader()
const clock = new THREE.Clock()

let mixer = null
let actions = []
let currentAction = null
let currentPet = null
let petRoot = null
let dragMoved = false
const pointer = { x: 0, y: 0 }

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

function playAction(action, { fade = 0.25, persist = true } = {}) {
  if (!action || action === currentAction) return
  if (currentAction) currentAction.fadeOut(fade)
  action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play()
  currentAction = action
  animNameEl.textContent = prettyAnimName(action.getClip().name)
  if (persist && currentPet) saveLastAnim(currentPet.id, action.getClip().name)
}

function playRandomAction() {
  if (!actions.length) return
  const pool = actions.filter((a) => a !== currentAction)
  const list = pool.length ? pool : actions
  playAction(list[Math.floor(Math.random() * list.length)])
}

function clearPet() {
  if (petRoot) {
    scene.remove(petRoot)
    petRoot.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
        else obj.material?.dispose()
      }
    })
  }
  petRoot = null
  mixer = null
  actions = []
  currentAction = null
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
  // tiny lift so paws don't z-fight the ground plane
  root.position.y += 0.01

  const height = scaled.max.y - scaled.min.y
  controls.target.set(0, Math.max(0.45, height * 0.45), 0)
  camera.position.set(2.6, Math.max(1.4, height * 0.85), 3.6)
  controls.update()
}

async function loadPet(pet) {
  petNameEl.textContent = '加载中…'
  animNameEl.textContent = '—'
  clearPet()

  const gltf = await loader.loadAsync(pet.url)
  const root = gltf.scene
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  framePet(root, pet.scale)
  scene.add(root)
  petRoot = root
  currentPet = pet
  localStorage.setItem(STORAGE_PET, pet.id)
  petNameEl.textContent = pet.name
  renderPetList()

  const clips = pickUniqueAnims(gltf.animations || [])
  mixer = new THREE.AnimationMixer(root)
  actions = clips.map((clip) => mixer.clipAction(clip))

  const savedAnim = readLastAnims()[pet.id]
  const preferred =
    findActionBySavedName(actions, savedAnim) ||
    actions.find(
      (a) =>
        /^idle$/i.test(prettyAnimName(a.getClip().name).trim()) ||
        (/idle/i.test(a.getClip().name) && !/hit|react|eat|head/i.test(a.getClip().name)),
    ) ||
    actions[0]
  if (preferred) playAction(preferred, { fade: 0, persist: true })
  else animNameEl.textContent = '无可用动作'
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
      if (currentPet?.id === pet.id) {
        settingsEl.hidden = true
        return
      }
      try {
        await loadPet(pet)
        settingsEl.hidden = true
      } catch (err) {
        console.error(err)
        petNameEl.textContent = '加载失败'
        animNameEl.textContent = String(err.message || err)
      }
    })
    petListEl.append(btn)
  }
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  settingsEl.hidden = false
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
  playRandomAction()
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

function tick() {
  const dt = clock.getDelta()
  mixer?.update(dt)
  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
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
  try {
    await loadPet(initial)
  } catch (err) {
    console.error(err)
    petNameEl.textContent = '加载失败'
    animNameEl.textContent = String(err.message || err)
  }
  tick()
}

boot()
