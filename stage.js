import { makeBladeMaterial, makeCutMaterial, makeOreMaterial, setSurface, surfaceUniforms } from './materials.js';
import { familyOf } from './forge.js';

const T = globalThis.THREE;
const modelFiles = {
  ore: 'ore_small', blank: 'blank_ingot_small', straight: 'knife_straight',
  tangdao: 'knife_tangdao', karambit: 'knife_karambit',
};
const starts = { straight: .445, tangdao: .355, karambit: .44 };
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const lerp = (a, b, t) => a + (b - a) * t;

function coordinates(geometry, id) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const pos = geometry.attributes.position;
  const binCount = 40;
  const minY = Array(binCount).fill(Infinity);
  const maxY = Array(binCount).fill(-Infinity);
  const length = max.x - min.x;
  const along = x => clamp((x - min.x) / length, 0, .9999);
  const bin = x => Math.floor(along(x) * binCount);
  for (let i = 0; i < pos.count; i++) {
    const k = bin(pos.getX(i));
    const y = pos.getY(i);
    minY[k] = Math.min(minY[k], y);
    maxY[k] = Math.max(maxY[k], y);
  }
  const attrib = new Float32Array(pos.count * 4);
  const widthAt = (k, y) => clamp((y - minY[k]) / Math.max(.001, maxY[k] - minY[k]), 0, 1);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = along(x);
    const across = widthAt(bin(x), pos.getY(i));
    const blade = id === 'blank' ? 1 : clamp((t - starts[id] + .02) / .047, 0, 1);
    const sharp = clamp((.27 - across) / .24, 0, 1) * (id === 'blank' ? .23 : 1);
    attrib.set([t, across, blade, sharp], i * 4);
  }
  geometry.setAttribute('forgeCoord', new T.BufferAttribute(attrib, 4));
  const guides = minY.map((bottom, index) => {
    const t = (index + .5) / binCount;
    if (!Number.isFinite(bottom) || t < (starts[id] ?? 0) + .018) return null;
    const x = min.x + t * length;
    return new T.Vector3(x, (bottom + maxY[index]) / 2, max.z * .66);
  }).filter(Boolean);
  return { guides, along, across: (x, y) => widthAt(bin(x), y) };
}

function oreSection(geometry, cut) {
  const points = [];
  const pos = geometry.attributes.position;
  const indices = geometry.index;
  const count = indices?.count ?? pos.count;
  const at = i => new T.Vector3().fromBufferAttribute(pos, indices ? indices.getX(i) : i);
  for (let i = 0; i < count; i += 3) {
    const corners = [at(i), at(i + 1), at(i + 2)];
    for (let side = 0; side < 3; side++) {
      const a = corners[side], b = corners[(side + 1) % 3];
      if ((a.x < cut) === (b.x < cut)) continue;
      const t = (cut - a.x) / (b.x - a.x);
      points.push([lerp(a.y, b.y, t), lerp(a.z, b.z, t)]);
    }
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const hullHalf = list => {
    const half = [];
    for (const c of list) {
      while (half.length >= 2) {
        const [a, b] = half.slice(-2);
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0) break;
        half.pop();
      }
      half.push(c);
    }
    return half.slice(0, -1);
  };
  const rim = [...hullHalf(points), ...hullHalf(points.reverse())];
  const positions = [];
  for (let i = 1; i < rim.length - 1; i++) {
    for (const [y, z] of [rim[0], rim[i], rim[i + 1]]) positions.push(cut, y * .987, z * .987);
  }
  const slice = new T.BufferGeometry();
  slice.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  slice.computeVertexNormals();
  return slice;
}

function studio(renderer) {
  const room = new T.Scene();
  const floor = new T.Mesh(new T.BoxGeometry(10, 10, 10), new T.MeshBasicMaterial({ color: 0x242731, side: T.BackSide }));
  room.add(floor);
  const softbox = (x, y, z, width, height, color, energy) => {
    const mat = new T.MeshBasicMaterial({ color, side: T.DoubleSide, toneMapped: false });
    mat.color.multiplyScalar(energy);
    const object = new T.Mesh(new T.PlaneGeometry(width, height), mat);
    object.position.set(x, y, z);
    object.lookAt(0, 0, 0);
    room.add(object);
  };
  softbox(-1.8, 2.1, 3.4, 4.6, .8, 0xffe9d0, 4.3);
  softbox(2.8, .15, 2.8, 1.2, 4.6, 0xb0d1ff, 2.25);
  softbox(.7, -1.3, 2.4, 5.2, .46, 0xc5dae7, 2.05);
  softbox(-2.1, .2, -3.8, 4.2, 1.4, 0xf4a273, 1.55);
  const generator = new T.PMREMGenerator(renderer);
  const map = generator.fromScene(room, .025, .1, 18);
  generator.dispose();
  room.traverse(obj => { obj.geometry?.dispose(); obj.material?.dispose(); });
  return map;
}

function light(color, intensity, x, y, z, scene) {
  const key = new T.DirectionalLight(color, intensity);
  key.position.set(x, y, z);
  scene.add(key);
  return key;
}

function bevel(points, depth, size) {
  const outline = new T.Shape();
  points.forEach(([x, y], i) => i === 0 ? outline.moveTo(x, y) : outline.lineTo(x, y));
  outline.closePath();
  const geometry = new T.ExtrudeGeometry(outline, {
    depth, bevelEnabled: true, bevelThickness: size, bevelSize: size, bevelSegments: 1, steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function makeAnvil() {
  const group = new T.Group();
  const dark = new T.MeshStandardMaterial({ color: 0x333136, metalness: .74, roughness: .52 });
  const top = new T.MeshStandardMaterial({ color: 0x535358, metalness: .83, roughness: .39 });
  const base = new T.Mesh(bevel([[-.67, 0], [.67, 0], [.58, .10], [.29, .17], [.22, .34], [.46, .42], [-.46, .42], [-.22, .34], [-.30, .16], [-.60, .09]], .55, .028), dark);
  const crown = new T.Mesh(bevel([[-1.35, .51], [-.62, .55], [-.53, .59], [.67, .59], [.74, .48], [.59, .38], [-.69, .38], [-.98, .43]], .62, .025), top);
  group.add(base, crown);
  const foot = new T.Mesh(new T.CylinderGeometry(.72, .81, .12, 20), new T.MeshStandardMaterial({ color: 0x292522, roughness: .78 }));
  foot.position.y = -.07;
  group.add(foot);
  for (const x of [-.42, .43]) {
    const pin = new T.Mesh(new T.CylinderGeometry(.023, .023, .02, 8), top);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(x, .47, .33);
    group.add(pin);
  }
  group.position.set(0, -.91, -.22);
  group.rotation.y = -.12;
  return group;
}

function makeHammer() {
  const group = new T.Group();
  const iron = new T.MeshStandardMaterial({ color: 0x555359, metalness: .82, roughness: .34 });
  const ring = new T.MeshStandardMaterial({ color: 0x9d775c, metalness: .62, roughness: .39 });
  const wood = new T.MeshStandardMaterial({ color: 0x503026, roughness: .65 });
  const head = new T.Mesh(bevel([[-.26, -.10], [-.15, -.14], [.20, -.14], [.26, -.08], [.26, .075], [.20, .13], [-.20, .13], [-.26, .075]], .26, .023), iron);
  const shaft = new T.Mesh(new T.CylinderGeometry(.045, .055, .72, 8), wood);
  shaft.position.set(.043, .45, 0);
  const ferrule = new T.Mesh(new T.CylinderGeometry(.06, .06, .13, 8), ring);
  ferrule.position.set(.043, .18, 0);
  const pommel = new T.Mesh(new T.CylinderGeometry(.061, .057, .047, 8), ring);
  pommel.position.set(.043, .79, 0);
  group.add(head, shaft, ferrule, pommel);
  return group;
}

function makeSparks() {
  const max = 104;
  const geometry = new T.BufferGeometry();
  const positions = new Float32Array(max * 3);
  const color = new Float32Array(max * 3);
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('color', new T.BufferAttribute(color, 3).setUsage(T.DynamicDrawUsage));
  const material = new T.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { pointScale: { value: Math.min(devicePixelRatio, 1.5) } },
    vertexShader: `varying vec3 shade;
      uniform float pointScale;
      void main() {
        shade = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
        gl_PointSize = (2. + 3.4*clamp(max(max(color.r,color.g),color.b),0.,1.))*pointScale;
      }`,
    fragmentShader: `varying vec3 shade;
      void main() {
        float f = 1.-smoothstep(.06,.49,length(gl_PointCoord-.5));
        gl_FragColor = vec4(shade, f);
      }`,
  });
  const view = new T.Points(geometry, material);
  view.frustumCulled = false;
  view.visible = false;
  return { max, view, geometry, positions, color, particles: [] };
}

export class ForgeStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-2, 2, 1.2, -1.2, .1, 20);
    this.camera.position.set(0, .53, 6);
    this.camera.lookAt(0, -.07, 0);
    this.scene.environment = studio(this.renderer).texture;
    this.scene.add(new T.HemisphereLight(0xd7e4ff, 0x453025, .93));
    this.key = light(0xffcfad, 2.9, -2.7, 3.1, 4.8, this.scene);
    light(0xb9d8ff, 1.1, 3.5, 1.1, 2.5, this.scene);
    this.sweep = light(0xe9fbff, 0, -2.7, 1.5, 1.5, this.scene);
    this.flash = new T.PointLight(0xff8b44, 0, 3, 1.8);
    this.scene.add(this.flash);
    this.content = new T.Group();
    this.content.position.y = .13;
    this.scene.add(this.content);
    this.anvil = makeAnvil();
    this.hammer = makeHammer();
    this.hammerHome = new T.Vector3(1.37, .54, .56);
    this.sparks = makeSparks();
    this.scene.add(this.anvil, this.hammer, this.sparks.view);
    this.loader = new T.GLTFLoader();
    this.cache = new Map();
    this.pending = new Map();
    this.oreUniforms = {
      oreTint: { value: new T.Color() }, oreSeed: { value: 0 },
      oreReveal: { value: 0 }, oreGrade: { value: 0 },
    };
    this.mode = 'ore';
    this.want = 'ore';
    this.mesh = null;
    this.turnX = 0;
    this.turnY = 0;
    this.heat = 0;
    this.entered = performance.now();
    this.raycaster = new T.Raycaster();
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    requestAnimationFrame(this.frame);
  }

  load(id) {
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    if (this.pending.has(id)) return this.pending.get(id);
    const url = new URL(`./assets/models/${modelFiles[id]}.glb`, import.meta.url);
    const pending = this.loader.loadAsync(url.href).then(({ scene }) => {
      let source;
      scene.traverse(obj => { if (obj.isMesh && !source) source = obj; });
      const { geometry } = source;
      const coords = id === 'ore' ? null : coordinates(geometry, id);
      const uniforms = id === 'ore' ? this.oreUniforms : surfaceUniforms();
      const material = id === 'ore' ? makeOreMaterial(source.material, uniforms) : makeBladeMaterial(source.material, uniforms, id === 'blank');
      const mesh = new T.Mesh(geometry, material);
      const asset = { mesh, coords, uniforms };
      this.cache.set(id, asset);
      return asset;
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, pending);
    return pending;
  }

  async prepare() {
    await this.load('ore');
    const warm = async id => {
      const { mesh } = await this.load(id);
      const temporary = new T.Scene();
      temporary.environment = this.scene.environment;
      temporary.add(mesh.clone());
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) await this.renderer.compileAsync(temporary, this.camera, this.scene);
      else this.renderer.compile(temporary, this.camera, this.scene);
    };
    for (const id of ['blank', 'straight', 'tangdao', 'karambit']) {
      warm(id).catch(error => console.warn('Model preload', id, error));
    }
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.aspect = width / height;
    const vertical = Math.max(2.0, 3.85 / this.aspect);
    this.camera.left = -vertical * this.aspect / 2;
    this.camera.right = vertical * this.aspect / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix();
  }

  sync(run, ore, fit) {
    this.run = run;
    this.fit = fit;
    const previous = this.mode;
    this.mode = run.phase;
    if (previous !== this.mode) {
      this.entered = performance.now();
      this.turnX = this.turnY = 0;
      if (this.mode !== 'broken') this.clearPieces();
      if (this.mode !== 'reveal') this.clearOrePieces();
    }
    const stone = this.mode === 'ore' || this.mode === 'reveal';
    if (ore) {
      this.oreUniforms.oreTint.value.set(familyOf(ore.family).color);
      this.oreUniforms.oreSeed.value = ore.figure;
      this.oreUniforms.oreGrade.value = this.mode === 'reveal' ? ore.grade : 0;
      this.stoneShape = ore.figure;
    }
    this.want = stone ? 'ore' : run.model;
    if (this.cache.has(this.want)) this.show(this.want);
    else this.load(this.want).then(() => this.show(this.want)).catch(error => console.error('Blade model', error));
    if (this.mesh && this.shown !== 'ore') setSurface(this.active.uniforms, run, fit);
  }

  show(id) {
    if (!this.cache.has(id)) return;
    const asset = this.cache.get(id);
    if (this.shown !== id) {
      if (this.mesh) this.content.remove(this.mesh);
      this.content.add(asset.mesh);
      this.active = asset;
      this.mesh = asset.mesh;
      this.shown = id;
      this.mesh.visible = true;
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.position.set(0, 0, 0);
      this.mesh.scale.setScalar(id === 'ore' ? 1.58 : id === 'blank' ? 2.35 : 2.74);
      this.swapAt = performance.now();
    }
    if (id !== 'ore' && this.run) setSurface(asset.uniforms, this.run, this.fit);
    if (id === 'ore' && this.mode === 'reveal' && !this.orePieces) this.cutOre();
    if (id !== 'ore' && this.mode === 'broken' && !this.blow && !this.pieces) {
      this.split(new T.Vector3());
      this.splitAt -= 600;
    }
  }

  cutOre() {
    const cut = .025;
    const slice = this.oreCutGeometry ??= oreSection(this.mesh.geometry, cut);
    const section = this.oreCutMaterial ??= makeCutMaterial(this.oreUniforms);
    this.orePieces = [-1, 1].map(direction => {
      const plane = new T.Plane();
      const material = makeOreMaterial(this.mesh.material, this.oreUniforms);
      material.clippingPlanes = [plane];
      const group = new T.Group();
      group.add(new T.Mesh(this.mesh.geometry, material), new T.Mesh(slice, section));
      group.scale.copy(this.mesh.scale);
      this.content.add(group);
      return { group, material, plane, direction, cut };
    });
    this.mesh.visible = false;
  }

  clearOrePieces() {
    if (!this.orePieces) return;
    for (const { group, material } of this.orePieces) {
      this.content.remove(group);
      material.dispose();
    }
    this.orePieces = null;
    if (this.mesh) this.mesh.visible = true;
  }

  animateOreCut(elapsed) {
    if (!this.orePieces) return;
    const time = this.reduceMotion ? 1 : clamp(elapsed / 570, 0, 1);
    const slide = 1 - (1 - time) ** 3;
    for (const { group, plane, direction, cut } of this.orePieces) {
      group.position.set(direction * .49 * slide, -direction * .09 * slide, -.06 * slide);
      group.rotation.set(.02 * slide, direction * 1.02 * slide, direction * .13 * slide);
      group.updateWorldMatrix(true, false);
      plane.setFromNormalAndCoplanarPoint(
        new T.Vector3(direction, 0, 0).transformDirection(group.matrixWorld),
        group.localToWorld(new T.Vector3(cut, 0, 0)),
      );
    }
  }

  turn(dx, dy) {
    this.turnY += dx * .016;
    this.turnX = clamp(this.turnX + dy * .012, -.9, .9);
  }

  project(world, rect) {
    const p = world.clone().project(this.camera);
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }

  hit(clientX, clientY) {
    if (!this.active?.coords || this.mode !== 'forge') return null;
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    const impact = this.raycaster.intersectObject(this.mesh, false)[0];
    let local = impact && this.mesh.worldToLocal(impact.point.clone());
    const { coords } = this.active;
    if (local && this.shown !== 'blank' && coords.along(local.x) < starts[this.shown] - .035) return null;
    if (!local) {
      let best = Infinity;
      for (const guide of coords.guides) {
        const screen = this.project(this.mesh.localToWorld(guide.clone()), rect);
        const distance = Math.hypot(screen.x - clientX, screen.y - clientY);
        if (distance < best) { best = distance; local = guide.clone(); }
      }
      if (best > (this.aspect < 1.35 ? 24 : 19)) return null;
    }
    const t = coords.along(local.x);
    const zone = t > .86 ? 'tip' : coords.across(local.x, local.y) < .30 ? 'edge' : 'belly';
    return { local, world: this.mesh.localToWorld(local.clone()), zone };
  }

  keyboardHit() {
    if (!this.active?.coords) return null;
    const guides = this.active.coords.guides;
    const local = guides[Math.floor(guides.length * .47)].clone();
    return { local, world: this.mesh.localToWorld(local.clone()), zone: 'belly' };
  }

  swing(hit, onImpact, onReady) {
    this.blow = { hit, onImpact, onReady, start: performance.now(), landed: false, contact: 114, end: 349 };
  }

  impact(hit, event) {
    const high = event.type === 'surge' || event.change?.tier === 3;
    const broken = event.type === 'break';
    this.bangedAt = performance.now();
    this.bangPower = broken ? 1.6 : high ? 1.2 : .72;
    this.flash.position.copy(hit.world).add(new T.Vector3(0, .12, .32));
    if (this.active?.uniforms.fHit) this.active.uniforms.fHit.value.copy(hit.local);
    const color = new T.Color(broken ? '#ff634b' : high ? '#b6e9ff' : '#ff9b47');
    this.emit(hit.world, color, broken ? 63 : high ? 51 : 26, high || broken);
    if (broken) this.split(hit.local);
  }

  reveal() {
    if (!this.mesh) return;
    const center = this.content.position.clone();
    center.z = .5;
    this.emit(center, this.oreUniforms.oreTint.value.clone(), 28, false);
  }

  emit(point, tint, count, long) {
    const particles = this.sparks.particles;
    for (let i = 0; i < count; i++) {
      const speed = (long ? 2.8 : 2.1) * (.30 + Math.random());
      const angle = Math.random() * Math.PI * 1.6 + Math.PI * .06;
      particles.push({
        point: point.clone(),
        speed: new T.Vector3(Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed * .88, (Math.random() - .34) * speed),
        tint: tint.clone().lerp(new T.Color('#fff1cb'), Math.random() * .64),
        age: 0, life: (long ? .39 : .18) + Math.random() * .33,
      });
    }
    if (particles.length > this.sparks.max) particles.splice(0, particles.length - this.sparks.max);
  }

  split(local) {
    if (!this.mesh?.visible || this.pieces) return;
    const x = clamp(local.x, -.22, .23);
    const active = this.active;
    this.pieces = [-1, 1].map(direction => {
      const piece = this.mesh.clone();
      const plane = new T.Plane();
      piece.material = makeBladeMaterial(this.mesh.material, active.uniforms, this.shown === 'blank');
      piece.material.clippingPlanes = [plane];
      this.content.add(piece);
      return { piece, plane, direction, x };
    });
    this.splitAt = performance.now();
    this.mesh.visible = false;
  }

  clearPieces() {
    if (!this.pieces) return;
    for (const { piece } of this.pieces) {
      this.content.remove(piece);
      piece.material.dispose();
    }
    this.pieces = null;
    if (this.mesh) this.mesh.visible = true;
  }

  animatePieces(now) {
    if (!this.pieces) return;
    const life = clamp((now - this.splitAt) / 590, 0, 1);
    const eased = 1 - (1 - life) ** 2;
    for (const { piece, plane, direction, x } of this.pieces) {
      piece.position.set(direction * eased * .26, -.23 * life * life, direction * .09 * eased);
      piece.rotation.z = -direction * eased * .16;
      piece.updateWorldMatrix(true, false);
      plane.setFromNormalAndCoplanarPoint(
        new T.Vector3(direction, 0, 0).transformDirection(piece.matrixWorld),
        piece.localToWorld(new T.Vector3(x, 0, 0)),
      );
    }
  }

  animateSparks(dt) {
    const { geometry, particles, positions, color, view } = this.sparks;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }
    particles.forEach((p, i) => {
      p.speed.y -= dt * 4.8;
      p.point.addScaledVector(p.speed, dt).toArray(positions, i * 3);
      const fade = (1 - p.age / p.life) ** 1.5 * 1.23;
      color[i * 3] = p.tint.r * fade;
      color[i * 3 + 1] = p.tint.g * fade;
      color[i * 3 + 2] = p.tint.b * fade;
    });
    view.visible = particles.length > 0;
    geometry.setDrawRange(0, particles.length);
    if (view.visible) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    }
  }

  frame = (now) => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(.035, (now - (this.previousFrame || now)) / 1000);
    this.previousFrame = now;
    if (document.hidden) return;
    const t = now / 1000;
    const mode = this.mode;
    const elapsed = now - this.entered;
    const inspect = ['fit', 'appraise'].includes(mode);
    const stone = this.shown === 'ore';
    const strikeAge = now - (this.bangedAt ?? -5000);
    const impulse = Math.exp(-strikeAge / 116) * (this.bangPower || 0);
    const shake = this.reduceMotion ? 0 : impulse * .037 * Math.sin(strikeAge / 21);
    const narrow = this.aspect < 1.3;
    const angle = stone ? -.18 : narrow ? .48 : .29;
    const startTurn = mode === 'appraise' && !this.reduceMotion ? .46 * (1 - clamp(elapsed / 1300, 0, 1)) : 0;
    const stoneTurn = mode === 'reveal' ? .10 : this.reduceMotion ? .65 : t * .29;
    this.content.rotation.set(stone ? .27 + this.turnX : .055 + this.turnX, stone ? stoneTurn + this.turnY : -.10 + this.turnY + startTurn, angle + shake);
    const working = mode === 'forge' || mode === 'broken' || mode === 'refine';
    this.content.position.set(stone ? 0 : -.03, (stone ? .02 : working ? .12 : .21) - Math.abs(shake) * .50, .10);
    const stoneShape = this.stoneShape ?? .5;
    if (stone && mode === 'ore' && this.mesh) this.mesh.scale.set(1.39 + stoneShape * .36, 1.68 - stoneShape * .21, 1.43 + stoneShape * .28);
    this.oreUniforms.oreReveal.value = mode === 'reveal' ? clamp(elapsed / 520, 0, 1) : 0;
    if (this.active?.uniforms.fClock) {
      const { uniforms } = this.active;
      uniforms.fClock.value = this.reduceMotion ? 0 : t;
      uniforms.fHeat.value = mode === 'refine' ? this.heat : mode === 'forge' && this.shown === 'blank' ? .15 : 0;
      uniforms.fPulse.value = Math.min(1.3, impulse);
    }
    this.anvil.visible = working;
    this.anvil.position.set(.10, narrow ? -.91 : -.78, -.42);
    this.anvil.rotation.z = .11;
    this.hammer.visible = mode === 'forge' || !!this.blow;
    this.flash.intensity = impulse * 5.3;
    this.sweep.intensity = inspect ? (mode === 'appraise' ? .45 + 1.1 * Math.exp(-elapsed / 820) : .58) : 0;
    this.sweep.position.x = lerp(-2.8, 2.6, clamp(elapsed / 1500, 0, 1));
    this.key.intensity = mode === 'refine' ? 2.25 : mode === 'appraise' ? 2.65 : 2.9;
    const blow = this.blow;
    if (blow) {
      const age = now - blow.start;
      const reach = blow.hit.world.clone().add(new T.Vector3(.018, .145, .13));
      if (age < blow.contact) {
        const p = age / blow.contact;
        this.hammer.position.lerpVectors(this.hammerHome, reach, p * p * (2.1 - 1.1 * p));
        this.hammer.position.y += Math.sin(p * Math.PI) * .34;
        this.hammer.rotation.set(.10, -.27, lerp(-.68, -.19, p));
      } else {
        if (!blow.landed) { blow.landed = true; blow.onImpact(); }
        const p = clamp((age - blow.contact - 22) / (blow.end - blow.contact - 22), 0, 1);
        this.hammer.position.lerpVectors(reach, this.hammerHome, 1 - (1 - p) ** 2.3);
        this.hammer.rotation.set(.10, -.27, lerp(-.19, -.68, p));
        if (age >= blow.end) { this.blow = null; blow.onReady(); }
      }
    } else {
      this.hammer.position.copy(this.hammerHome);
      this.hammer.rotation.set(.10, -.27, -.68);
    }
    this.animatePieces(now);
    this.animateOreCut(elapsed);
    this.animateSparks(dt);
    this.renderer.render(this.scene, this.camera);
  };
}
