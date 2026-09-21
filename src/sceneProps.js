import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import {
  addCircleCollider,
  meshGroundBox,
  removeCollidersBySource,
  stylizeVillageMaterials,
} from './world.js'

export const LIVE_SCENE_KEY = '3dpet-live-scene-v1'
export const EDITOR_AUTOSAVE_KEY = '3dpet-editor-autosave-v1'

const BASE = import.meta.env.BASE_URL
const loader = new GLTFLoader()
const templates = new Map()

/** Shared brightness for editor materials. */
export const brightnessUniform = { value: 1.25 }

export function assetUrl(file) {
  return `${BASE}${String(file || '').replace(/^\//, '')}`
}

export function readLiveScene() {
  try {
    const raw = localStorage.getItem(LIVE_SCENE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || (!Array.isArray(data.items) && !Array.isArray(data.bases))) return null
    return data
  } catch {
    return null
  }
}

export async function loadDefaultPlayScene() {
  const res = await fetch(assetUrl('scenes/default.json'))
  if (!res.ok) throw new Error(`default scene ${res.status}`)
  return res.json()
}

export async function resolvePlayScene() {
  return readLiveScene() || loadDefaultPlayScene()
}

export function writeLiveScene(data) {
  localStorage.setItem(LIVE_SCENE_KEY, JSON.stringify(data))
}

export function clearLiveScene() {
  localStorage.removeItem(LIVE_SCENE_KEY)
}

function targetScale(size, name) {
  const n = (name || '').toLowerCase()
  const height = Math.max(size.y, 0.01)
  const footprint = Math.max(size.x, size.z, 0.01)
  const byHeight = (target) => target / height
  const byWidth = (target) => target / footprint
  if (/clover|bush|path straight|^path|round window|^window$|^bell$|package|^bag|^bags|barrel/.test(n)) return byHeight(0.38)
  if (/chicken(?!coop)|pug|sheep/.test(n)) return byHeight(0.72)
  if (/^pig$/.test(n)) return byHeight(0.85)
  if (/cow|horse|llama|zebra/.test(n)) return byHeight(1.5)
  if (/fence/.test(n)) return byHeight(1.05)
  if (/^rock$/.test(n)) return byHeight(0.6)
  if (/rocks|stairs/.test(n)) return byHeight(1.2)
  if (/tree/.test(n)) return byHeight(4)
  if (/mountain group/.test(n)) return byHeight(16)
  if (/mountain/.test(n)) return byHeight(12)
  if (/windmill/.test(n)) return byHeight(7.4)
  if (/watch tower|bell tower/.test(n)) return byHeight(6.2)
  if (/fortress|castle|gate/.test(n)) return byWidth(5.6)
  if (/^hut$/.test(n)) return byWidth(2.2)
  if (/small barn/.test(n)) return byWidth(2.6)
  return byWidth(3.1)
}

let namesById = null

async function modelName(file) {
  if (!namesById) {
    namesById = {}
    try {
      const data = await fetch(assetUrl('editor-manifest.json')).then((res) => res.json())
      for (const [id, info] of Object.entries(data.meta || {})) namesById[id] = info.name || ''
    } catch {
      namesById = {}
    }
  }
  const id = String(file).split('/').pop().replace('.glb', '')
  return namesById[id] || ''
}

function applyBrightShader(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const m of mats) {
      if (!m || m.__brightApplied) continue
      m.__brightApplied = true
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uBrightness = brightnessUniform
        if (!shader.fragmentShader.includes('uniform float uBrightness')) {
          shader.fragmentShader = shader.fragmentShader.includes('#include <common>')
            ? shader.fragmentShader.replace(
                '#include <common>',
                '#include <common>\nuniform float uBrightness;',
              )
            : `uniform float uBrightness;\n${shader.fragmentShader}`
        }
        if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
            gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(1.0 / max(uBrightness, 0.001)));`,
          )
        }
      }
      m.customProgramCacheKey = () => 'brightPass'
      m.needsUpdate = true
    }
  })
}

async function templateFor(file, stylize) {
  const key = `${stylize ? 'world' : 'editor'}:${file}`
  if (templates.has(key)) return templates.get(key)

  const gltf = await loader.loadAsync(assetUrl(file))
  const model = gltf.scene
  if (stylize) stylizeVillageMaterials(model)
  else applyBrightShader(model)

  let box = meshGroundBox(model)
  const size = box.getSize(new THREE.Vector3())
  const scale = targetScale(size, await modelName(file))
  if (Number.isFinite(scale) && scale > 0) model.scale.setScalar(scale)

  model.updateMatrixWorld(true)
  box = meshGroundBox(model)
  const center = box.getCenter(new THREE.Vector3())
  model.position.x -= center.x
  model.position.z -= center.z
  model.position.y -= box.min.y
  model.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = true
    obj.receiveShadow = true
  })
  model.userData.sourceClips = gltf.animations || []
  templates.set(key, model)
  return model
}

function hasSkeleton(root) {
  let skinned = false
  root.traverse((obj) => {
    if (obj.isSkinnedMesh) skinned = true
  })
  return skinned
}

function prettyAnimName(name) {
  return String(name || '')
    .replace(/^(AnimalArmature\|)+/g, '')
    .replace(/^(Armature\|)+/g, '')
    .replace(/\|+/g, ' ')
    .replace(/_/g, ' ')
    .trim()
}

function isAnimalName(name) {
  return /^(pug|horse|cow|pig|llama|sheep|zebra)$/i.test(String(name || '').trim())
}

function isIdleClip(name) {
  const pretty = prettyAnimName(name)
  return /idle/i.test(pretty) && !/hit|react|jump/i.test(pretty)
}

function isDeathClip(name) {
  return /death/i.test(prettyAnimName(name))
}

const placedActors = new Set()

function bindAnimal(pivot, clips) {
  const model = pivot.children[0]
  if (!model || !clips?.length) return
  const unique = []
  const seen = new Set()
  for (const clip of clips) {
    if (isDeathClip(clip.name)) continue
    const key = prettyAnimName(clip.name).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(clip)
  }
  if (!unique.length) return

  const mixer = new THREE.AnimationMixer(model)
  const actions = unique.map((clip) => mixer.clipAction(clip, model))
  const idles = actions.filter((action) => isIdleClip(action.getClip().name))
  const tricks = actions.filter((action) => !isIdleClip(action.getClip().name))
  let current = null

  const play = (action, loop) => {
    if (!action) return
    action.enabled = true
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    action.clampWhenFinished = !loop
    if (current && current !== action) current.fadeOut(0.15)
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.15).play()
    current = action
  }

  mixer.addEventListener('finished', (event) => {
    if (event.action !== current) return
    play(idles[0] || actions[0], true)
  })

  const actor = {
    mixer,
    playIdle() {
      play(idles[0] || actions[0], true)
    },
    playTrick() {
      if (!tricks.length) return
      play(tricks[Math.floor(Math.random() * tricks.length)], false)
    },
  }
  actor.playIdle()
  mixer.update(0)
  pivot.userData.actor = actor
  placedActors.add(actor)
}

export function updatePlacedActors(dt) {
  for (const actor of placedActors) actor.mixer.update(dt)
}

export function releasePlaced(obj) {
  const actor = obj?.userData?.actor
  if (!actor) return
  actor.mixer.stopAllAction()
  placedActors.delete(actor)
  obj.userData.actor = null
}

export function actorFromObject(obj) {
  let node = obj
  while (node) {
    if (node.userData?.actor) return node.userData.actor
    node = node.parent
  }
  return null
}

/** Pivot origin is the grounded, centered foot point. Placement writes pivot.position. */
export async function loadPlacedModel(file, { stylize = false } = {}) {
  const clean = String(file || '').replace(/^\//, '')
  const template = await templateFor(clean, stylize)
  const model = hasSkeleton(template) ? cloneSkinned(template) : template.clone(true)
  const pivot = new THREE.Group()
  pivot.add(model)
  pivot.userData.modelFile = clean
  const name = await modelName(clean)
  if (isAnimalName(name)) bindAnimal(pivot, template.userData.sourceClips)
  return pivot
}

export function clampAboveGround(obj) {
  if (!obj || obj.userData.floating || obj.userData.allowSink) return
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  if (box.min.y < 0) obj.position.y += -box.min.y
}

let customGroup = null

export async function mountLiveScene(scene, data) {
  if (customGroup) {
    customGroup.traverse((obj) => {
      if (obj.userData?.actor) releasePlaced(obj)
    })
    scene.remove(customGroup)
    customGroup = null
  }
  removeCollidersBySource('custom')

  const group = new THREE.Group()
  group.name = 'custom-scene'
  const items = data?.items || []
  for (const it of items) {
    try {
      const obj = await loadPlacedModel(it.file, { stylize: true })
      const p = it.p || [0, 0, 0]
      obj.position.set(p[0] || 0, p[1] || 0, p[2] || 0)
      obj.rotation.y = it.ry || 0
      clampAboveGround(obj)
      group.add(obj)
      obj.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(obj)
      const size = box.getSize(new THREE.Vector3())
      if (size.x > 0.35 && size.z > 0.35) {
        const r = Math.min(3.2, Math.max(0.25, Math.max(size.x, size.z) * 0.5 * 0.62))
        addCircleCollider((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, r, false, 'custom')
      }
    } catch (err) {
      console.warn('skip scene item', it?.file, err)
    }
  }
  scene.add(group)
  customGroup = group
  return group
}
