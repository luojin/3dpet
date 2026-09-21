import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  EDITOR_AUTOSAVE_KEY,
  assetUrl,
  clampAboveGround,
  loadPlacedModel,
  releasePlaced,
  updatePlacedActors,
  writeLiveScene,
} from './sceneProps.js'
import { createEnvironment, layoutBaseProps, spinBaseProps } from './baseScene.js'

const round = (v) => Math.round(v * 1000) / 1000
const BASE = import.meta.env.BASE_URL

const app = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.15
renderer.outputColorSpace = THREE.SRGBColorSpace
app.appendChild(renderer.domElement)

const SKY = 0x9fd4f0
const scene = new THREE.Scene()
scene.background = new THREE.Color(SKY)
scene.fog = new THREE.Fog(SKY, 80, 280)

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(8, 12, 16)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.maxPolarAngle = Math.PI * 0.49
controls.minDistance = 5
controls.maxDistance = 160
controls.target.set(0, 1, -4)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 1.25
pmrem.dispose()

scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x7ba05f, 0.9))
const sun = new THREE.DirectionalLight(0xffffff, 2.1)
sun.position.set(40, 60, 25)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -80
sun.shadow.camera.right = 80
sun.shadow.camera.top = 80
sun.shadow.camera.bottom = -80
sun.shadow.camera.near = 1
sun.shadow.camera.far = 250
scene.add(sun)

const { grass: ground } = createEnvironment(scene)
scene.background = new THREE.Color(0x8ecfff)
scene.fog = null

const grid = new THREE.GridHelper(80, 40, 0xffffff, 0xd7f0c8)
grid.material.opacity = 0.3
grid.material.transparent = true
grid.position.y = 0.01
scene.add(grid)

const tc = new TransformControls(camera, renderer.domElement)
tc.setSize(0.9)
scene.add(tc.getHelper())

let tcBusy = false
tc.addEventListener('dragging-changed', (e) => {
  tcBusy = e.value
  controls.enabled = !e.value
})
tc.addEventListener('objectChange', () => {
  clampAboveGround(selected)
  updatePropsPanel()
  scheduleAutoSave()
})

const objects = []
let selected = null
let mode = 'translate'
let saveTimer = null
let statusTimer = null
let armedFile = null
let metaMap = {}

function applyMode() {
  tc.setMode(mode)
  if (mode === 'rotate') {
    tc.showX = false
    tc.showY = true
    tc.showZ = false
  } else {
    tc.showX = true
    tc.showY = true
    tc.showZ = true
  }
  document.getElementById('btnMove').classList.toggle('active', mode === 'translate')
  document.getElementById('btnRotate').classList.toggle('active', mode === 'rotate')
}

function select(obj) {
  selected = obj
  if (obj) {
    tc.attach(obj)
    applyMode()
  } else {
    tc.detach()
  }
  updatePropsPanel()
}

function deselect() {
  select(null)
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

const invList = document.getElementById('invList')
const CAT_NAME = { palace: '宫殿', farm: '农场', village: '村庄' }

function markArmed(file) {
  armedFile = file
  invList.querySelectorAll('.item').forEach((el) => {
    el.classList.toggle('armed', el.dataset.file === file)
  })
}

async function buildInventory() {
  const res = await fetch(assetUrl('editor-manifest.json'))
  const data = await res.json()
  metaMap = data.meta || {}

  const seen = new Set()
  const groups = {}
  for (const s of data.scenes || []) {
    for (const f of s.files || []) {
      if (seen.has(f)) continue
      seen.add(f)
      const cat = s.category || 'other'
      ;(groups[cat] ||= []).push(f)
    }
  }

  for (const [cat, files] of Object.entries(groups)) {
    const head = document.createElement('div')
    head.className = 'cat'
    head.textContent = `${CAT_NAME[cat] || cat}（${files.length}）`
    invList.appendChild(head)

    files.forEach((file, i) => {
      const sid = file.split('/').pop().replace('.glb', '')
      const info = metaMap[sid] || {}
      const name = info.name || `${CAT_NAME[cat] || cat} #${i + 1}`

      const item = document.createElement('div')
      item.className = 'item'
      item.draggable = true
      item.title = name
      item.dataset.file = file

      const img = document.createElement('img')
      img.className = 'thumb'
      img.alt = name
      img.draggable = false
      if (info.thumb) img.src = assetUrl(info.thumb)

      const label = document.createElement('div')
      label.className = 'iname'
      label.textContent = name

      item.append(img, label)
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', file)
        e.dataTransfer.effectAllowed = 'copy'
      })
      item.addEventListener('click', () => {
        if (armedFile === file) {
          markArmed(null)
          setStatus('已取消摆放')
          return
        }
        markArmed(file)
        setStatus(`已选 ${name}，点击地面摆放`)
      })
      invList.appendChild(item)
    })
  }
}

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

function groundPoint(clientX, clientY) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1
  ndc.y = -(clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObject(ground)
  return hits.length ? hits[0].point : new THREE.Vector3(0, 0, 0)
}

app.addEventListener('dragover', (e) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
})

app.addEventListener('drop', async (e) => {
  e.preventDefault()
  const file = e.dataTransfer.getData('text/plain')
  if (!file) return
  const p = groundPoint(e.clientX, e.clientY)
  await addModel(file, p)
})

async function addModel(file, pos) {
  showLoading('加载物品…')
  try {
    const obj = await loadPlacedModel(file, { stylize: true })
    obj.position.set(pos.x, 0, pos.z)
    clampAboveGround(obj)
    scene.add(obj)
    objects.push(obj)
    select(obj)
    scheduleAutoSave()
    setStatus(`已添加（共 ${objects.length} 个）`)
  } catch (err) {
    console.error('load failed', file, err)
    setStatus('加载失败')
  }
  hideLoading()
}

let down = null
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, button: e.button }
})
renderer.domElement.addEventListener('pointerup', async (e) => {
  if (!down || e.button !== 0) return
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
  down = null
  if (moved > 6) return
  if (tcBusy || tc.axis) return

  if (armedFile) {
    const p = groundPoint(e.clientX, e.clientY)
    await addModel(armedFile, p)
    return
  }

  ndc.x = (e.clientX / window.innerWidth) * 2 - 1
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObjects(objects, true)
  if (!hits.length) {
    deselect()
    return
  }
  let root = hits[0].object
  while (root.parent && !objects.includes(root)) root = root.parent
  if (objects.includes(root)) {
    select(root)
    root.userData.actor?.playTrick()
  }
})

function deleteSelected() {
  if (!selected) return
  const i = objects.indexOf(selected)
  if (i >= 0) objects.splice(i, 1)
  releasePlaced(selected)
  scene.remove(selected)
  deselect()
  scheduleAutoSave()
  setStatus(`已删除（剩 ${objects.length} 个）`)
}

function serialize() {
  const bases = []
  const items = []
  for (const obj of objects) {
    const p = [round(obj.position.x), round(obj.position.y), round(obj.position.z)]
    const ry = round(obj.rotation.y)
    if (obj.userData.baseId) bases.push({ id: obj.userData.baseId, p, ry })
    else if (obj.userData.modelFile) items.push({ file: obj.userData.modelFile, p, ry })
  }
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    bases,
    items,
  }
}

function scheduleAutoSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(EDITOR_AUTOSAVE_KEY, JSON.stringify(serialize()))
    setStatus('已自动保存')
  }, 500)
}

function exportScene() {
  const data = serialize()
  if (!data.bases.length && !data.items.length) {
    setStatus('场景为空')
    return
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `scene-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  setStatus('已导出 json，可再导入或在宠物页使用')
}

function useAsCurrentScene() {
  const data = serialize()
  writeLiveScene(data)
  localStorage.setItem(EDITOR_AUTOSAVE_KEY, JSON.stringify(data))
  setStatus('已设为当前场景，返回宠物页即可看到')
}

async function applyScene(data, withLoading) {
  objects.forEach((obj) => {
    releasePlaced(obj)
    scene.remove(obj)
  })
  objects.length = 0
  deselect()

  const savedBases = data?.version >= 2 ? data.bases : null
  for (const obj of layoutBaseProps(savedBases)) {
    scene.add(obj)
    objects.push(obj)
  }

  const items = (data?.items || []).filter((it) => it?.file)
  if (withLoading && items.length) showLoading(`载入 ${items.length} 个物品…`)
  for (const it of items) {
    try {
      const obj = await loadPlacedModel(it.file, { stylize: true })
      const p = it.p || [0, 0, 0]
      obj.position.set(p[0] || 0, p[1] || 0, p[2] || 0)
      obj.rotation.y = it.ry || 0
      clampAboveGround(obj)
      scene.add(obj)
      objects.push(obj)
    } catch (err) {
      console.warn('skip broken item', it.file, err)
    }
  }
  hideLoading()
  scheduleAutoSave()
}

const fileInput = document.getElementById('fileInput')
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0]
  if (!f) return
  try {
    const data = JSON.parse(await f.text())
    await applyScene(data, true)
    setStatus(`已导入 ${objects.length} 个物品`)
  } catch {
    setStatus('导入失败：文件格式不正确')
  }
  fileInput.value = ''
})

function updatePropsPanel() {
  const body = document.getElementById('propBody')
  if (!selected) {
    body.innerHTML = '<div class="empty">未选中物体<br/>点击场景中的物品</div>'
    return
  }
  const file = selected.userData.modelFile || ''
  const baseLabel = selected.userData.label
  const sid = file.split('/').pop().replace('.glb', '')
  const info = metaMap[sid] || {}
  const displayName = baseLabel || info.name || sid.slice(0, 10)
  const thumb = !baseLabel && info.thumb ? assetUrl(info.thumb) : ''
  const deg = ((selected.rotation.y * 180) / Math.PI).toFixed(0)
  body.innerHTML = `
    ${thumb ? `<img class="pthumb" src="${esc(thumb)}" alt="" />` : ''}
    <div class="row"><span class="k">名称</span><span class="v">${esc(displayName)}</span></div>
    <div class="row"><span class="k">X（左右）</span><span class="v">${selected.position.x.toFixed(2)}</span></div>
    <div class="row"><span class="k">Y（高度）</span><span class="v">${selected.position.y.toFixed(2)}</span></div>
    <div class="row"><span class="k">Z（前后）</span><span class="v">${selected.position.z.toFixed(2)}</span></div>
    <div class="row"><span class="k">水平旋转</span><span class="v">${deg}°</span></div>
    <button class="btn del" id="propDel" type="button">删除此物体</button>
  `
  document.getElementById('propDel').onclick = deleteSelected
}

const loadingEl = document.getElementById('loading')
const loadTxt = document.getElementById('loadTxt')
function showLoading(t) {
  loadTxt.textContent = t
  loadingEl.classList.remove('hidden')
}
function hideLoading() {
  loadingEl.classList.add('hidden')
}

function setStatus(t) {
  const el = document.getElementById('status')
  el.textContent = t
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => { el.textContent = '' }, 2800)
}

document.getElementById('btnMove').onclick = () => { mode = 'translate'; applyMode() }
document.getElementById('btnRotate').onclick = () => { mode = 'rotate'; applyMode() }
document.getElementById('btnDelete').onclick = deleteSelected
document.getElementById('btnExport').onclick = exportScene
document.getElementById('btnUse').onclick = useAsCurrentScene
document.getElementById('btnImport').onclick = () => fileInput.click()
document.getElementById('btnClear').onclick = async () => {
  markArmed(null)
  await applyScene({ version: 2, bases: [], items: [] }, false)
  setStatus('已清空，可点还原基础场景')
}
document.getElementById('btnRestore').onclick = async () => {
  markArmed(null)
  await applyScene(null, false)
  setStatus('已还原基础场景')
}
document.getElementById('backLink').href = `${BASE}index.html`

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'KeyQ') { mode = 'translate'; applyMode() }
  if (e.code === 'KeyE') { mode = 'rotate'; applyMode() }
  if (e.code === 'Delete') deleteSelected()
  if (e.code === 'Escape') {
    markArmed(null)
    deselect()
  }
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

function animate() {
  requestAnimationFrame(animate)
  const dt = 1 / 60
  spinBaseProps(scene, dt)
  updatePlacedActors(dt)
  const sky = scene.getObjectByName('sky')
  if (sky) {
    sky.position.x = camera.position.x
    sky.position.z = camera.position.z
  }
  controls.update()
  renderer.render(scene, camera)
}
animate()
applyMode()
updatePropsPanel()

;(async () => {
  try {
    await buildInventory()
  } catch (err) {
    console.warn('inventory', err)
    setStatus('背包加载失败')
  }
  const saved = localStorage.getItem(EDITOR_AUTOSAVE_KEY)
  let restored = false
  if (saved) {
    try {
      await applyScene(JSON.parse(saved), true)
      restored = true
    } catch {
      console.warn('restore failed')
    }
  }
  if (!restored) await applyScene(null, false)
  hideLoading()
})()
