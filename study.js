import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './RoomEnvironment.js';
import { createScrollJourney } from './scroll-journey.js';
import { sceneDepth } from './story/scene-depth.js';
import { createStory, END as STORY_END, STOPS as STORY_STOPS } from './story/story.js';

// Canonical Portfolio entrance plus three works and the wish-bottle ending.
// story-study redirects here so both addresses use this same entrance.
// One extra scroll chapter lets the introduction breathe before work one.
const INTRO_LENGTH = 1;
const END = STORY_END + INTRO_LENGTH;
const STOPS = [0, 1.4, ...STORY_STOPS.slice(1).map(stop => stop + INTRO_LENGTH)];
const $ = (id) => document.getElementById(id);
const BG = '#f3eedb', FLOOR = -500, TAU = Math.PI * 2;
const FOV2 = Math.tan(20 * Math.PI / 180);
// The original pastel wash is shared with the ground to keep the horizon continuous.
const mood = { value: 0 };
const grainTime = { value: 0 };
let story;
const paperWashShader = `
  uniform float mood,grainPixelRatio,grainTime,viewportHeight;
  float cloud(vec2 p,vec2 c,vec2 r) { vec2 d=(p-c)/r; return exp(-dot(d,d)*1.6); }
  float grainHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float driftingGrain(vec2 p) {
    vec2 cell=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(grainHash(cell),grainHash(cell+vec2(1.,0.)),f.x),
      mix(grainHash(cell+vec2(0.,1.)),grainHash(cell+vec2(1.,1.)),f.x),f.y)-.5;
  }
  // Restore the original fine paper grain across the background and ground.
  float paperGrain() {
    vec2 p=gl_FragCoord.xy/grainPixelRatio;
    vec2 fine=floor(p), fiber=floor(p*.42);
    float a=fract(sin(dot(fine,vec2(127.1,311.7)))*43758.5453)-.5;
    float b=fract(sin(dot(fiber,vec2(269.5,183.3)))*43758.5453)-.5;
    // Keep the paper still; a softer layer of dust drifts smoothly over it.
    float dust=driftingGrain(p*.65+vec2(sin(grainTime*.23)*.9,grainTime*2.8));
    vec2 snow=(p+vec2(grainTime*1.2+sin(grainTime*.27)*2.,grainTime*5.))/48.;
    vec2 cell=floor(snow);
    float seed=grainHash(cell+71.);
    vec2 center=.15+.70*vec2(grainHash(cell+13.),grainHash(cell+37.));
    float distance=length((fract(snow)-center)*48.);
    float flake=1.-smoothstep(.2,.7+seed*.8,distance);
    flake*=step(.78,seed)*(.68+.32*sin(grainTime*.65+seed*6.283185));
    return (a*.085+b*.025+dust*.030+flake*.13)*mix(1.,.30,smoothstep(4.31,5.18,mood));
  }
  vec3 paperColor(vec2 p) {
    p+=vec2(sin(mood*.85)*.10,cos(mood*.72)*.07-.07);
    p+=vec2(sin(p.y*9.+sin(p.x*5.)),cos(p.x*8.-p.y*3.))*.035;
    vec3 col=vec3(.956,.937,.843);
    col=mix(col,vec3(.57,.77,.65),cloud(p,vec2(.85,.63),vec2(.43,.56))*.86);
    col=mix(col,vec3(.64,.82,.75),cloud(p,vec2(.2,.15),vec2(.48,.42))*.82);
    col=mix(col,vec3(.92,.62,.67),cloud(p,vec2(.19,.69),vec2(.32,.4))*.86);
    col=mix(col,vec3(.97,.81,.40),cloud(p,vec2(.53,.52),vec2(.27,.45))*.73);
    col=mix(col,vec3(.95,.93,.76),cloud(p,vec2(.52,.86),vec2(.32,.24))*.33);
    // Whole palettes blend with depth, rather than nudging the same color clouds.
    float toMint=smoothstep(.48,1.24,mood);
    float toGold=smoothstep(1.65,2.42,mood);
    float toBlue=smoothstep(2.86,3.55,mood);
    float toBottle=smoothstep(4.11,4.91,mood);
    vec3 base=mix(vec3(.97,.84,.86),vec3(.76,.87,.80),toMint);
    vec3 accent=mix(vec3(.92,.70,.78),vec3(.57,.75,.65),toMint);
    vec3 light=mix(vec3(1.,.95,.84),vec3(.95,.97,.85),toMint);
    base=mix(base,vec3(.99,.92,.76),toGold);
    accent=mix(accent,vec3(.97,.81,.57),toGold);
    light=mix(light,vec3(1.,.97,.86),toGold);
    base=mix(base,vec3(.80,.87,.95),toBlue);
    accent=mix(accent,vec3(.62,.72,.88),toBlue);
    light=mix(light,vec3(.93,.95,1.),toBlue);
    base=mix(base,vec3(.90,.95,.90),toBottle);
    accent=mix(accent,vec3(.73,.85,.77),toBottle);
    light=mix(light,vec3(.99,.90,.91),toBottle);
    vec3 chapter=mix(base,accent,cloud(p,vec2(.76,.62),vec2(.40,.48))*.68);
    chapter=mix(chapter,light,cloud(p,vec2(.22,.36),vec2(.44,.58))*.84);
    // Share the same screen-height gradient with the ground, without a seam.
    float screenY=gl_FragCoord.y/(grainPixelRatio*viewportHeight);
    float groundLight=1.-smoothstep(.46,.87,screenY);
    vec3 night=mix(vec3(.115,.115,.13),vec3(.48,.48,.49),groundLight);
    return mix(mix(col,chapter,smoothstep(0.,.22,mood)),night,smoothstep(4.31,5.18,mood));
  }
`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const random = (n) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (n) => { n = clamp(n, 0, 1); return n * n * (3 - 2 * n); };
const ease = (n) => n < .5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
const pointer = { x: -999, y: -999, vx: 0, vy: 0, speed: 0, mx: 0, my: 0, at: 0 };
const dummy = new THREE.Object3D(), projected = new THREE.Vector3(), depth = new THREE.Vector3();
const right = new THREE.Vector3(), up = new THREE.Vector3(), target = new THREE.Vector3();
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const paperEnd = new THREE.Vector3(), paperLead = new THREE.Vector3();
const pathTangent = new THREE.Vector3(), pathSide = new THREE.Vector3(), pathUp = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const nearSlots = [[.94, .04], [.64, .8], [.95, .62], [.88, -.74], [-.93, -.8]];
let renderer, scene, camera, frameMaterial, glassMaterial, windowGroup, logoTexture, logoImage, pushImage, backdrop;
let flock, starGlow, uniforms, notes = [], panes = [], win, width, height, cameraDistance;
let paused = reduced.matches, lastCell = null, raf = 0, previousTime = null, elapsed = 0;
let cameraPath, lookPath, insideFrame, step = Math.max(200, innerHeight) * 1.7;
let journey = 0, scrollJourney;
const viewPointer = { x: 0, y: 0 };
const workHovers = [];

function makeGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), data = x.createImageData(256, 256);
  for (let i = 0; i < data.data.length; i += 4) {
    const tone = 160 + Math.floor(random(i) * 95), hue = i % 12;
    data.data[i] = tone + (hue === 0 ? 20 : 0); data.data[i + 1] = tone + (hue === 4 ? 18 : 0);
    data.data[i + 2] = tone + (hue === 8 ? 16 : 0); data.data[i + 3] = 255;
  }
  x.putImageData(data, 0, 0); $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

function makeBackdrop() {
  // A world-space wash sits behind the entire route, so it is refracted by the
  // glass and changes perspective as the camera travels through the paper.
  const material = new THREE.ShaderMaterial({ depthWrite: false, uniforms: { mood, grainTime, viewportHeight: { value: innerHeight }, grainPixelRatio: { value: renderer.getPixelRatio() }, washScale: { value: new THREE.Vector2(8600, 6100) } },
    vertexShader: `varying vec2 vPaper; uniform vec2 washScale;
      void main() { vec4 p=modelMatrix*vec4(position,1.); vPaper=p.xy/washScale+.5;
        gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader: `varying vec2 vPaper;
      ${paperWashShader}
      void main() {
        vec3 col=paperColor(vPaper);
        col+=paperGrain();
        gl_FragColor=vec4(col,1.);
      }`
  });
  backdrop = new THREE.Mesh(new THREE.PlaneGeometry(48000, 32000), material);
  backdrop.position.set(0, 0, -10800); scene.add(backdrop);
}

function makeStarFloor() {
  // Flat five-point marks on the XZ plane shrink naturally with camera distance.
  const material = new THREE.ShaderMaterial({ uniforms: { mood, grainTime, viewportHeight: backdrop.material.uniforms.viewportHeight, grainPixelRatio: backdrop.material.uniforms.grainPixelRatio, washScale: backdrop.material.uniforms.washScale },
    vertexShader: `varying vec3 vWorld; varying float vDepth;
      void main() { vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz;
        vec4 mv=viewMatrix*world; vDepth=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vWorld; varying float vDepth; uniform vec2 washScale;
      ${paperWashShader}
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main() {
        vec2 grid=vWorld.xz/180.; grid.x+=mod(floor(grid.y),2.)*.5;
        vec2 cell=floor(grid), p=(fract(grid)-.5)*180.;
        float seed=hash(cell); p-=(vec2(seed,hash(cell+19.))-.5)*13.;
        float a=atan(p.y,p.x)-1.570796+seed*.32;
        a=abs(mod(a+.628319,1.256637)-.628319);
        float outer=(17.+seed*8.)*mix(1.,1.45,smoothstep(4.31,5.18,mood)), inner=outer*.46;
        float radius=outer*inner*.587785/(inner*sin(.628319-a)+outer*sin(a));
        float d=length(p)-radius;
        float aa=max(.7,fwidth(d)), mark=1.-smoothstep(-aa,aa,d);
        mark*=1.-smoothstep(5.,13.,aa);
        float fade=1.-smoothstep(2100.,8500.,vDepth);
        vec3 col=mix(vec3(.956,.937,.843),paperColor(vWorld.xy/washScale+.5),.65+.35*smoothstep(0.,9500.,vDepth));
        col=mix(col,paperColor(vWorld.xy/washScale+.5),smoothstep(4.31,5.18,mood));
        float hue=mod(cell.x+cell.y,3.);
        vec3 ink=hue<1. ? vec3(.72,.43,.53) : hue<2. ? vec3(.36,.59,.48) : vec3(.73,.58,.27);
        col=mix(col,ink,mark*fade*(.32+seed*.14));
        col+=paperGrain();
        gl_FragColor=vec4(col,1.);
      }`
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(48000, 18800), material);
  floor.rotation.x=-Math.PI/2; floor.position.set(0,FLOOR-10,-1400); scene.add(floor);
}

function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d');
  const colors = ['#3e967e', '#77bfa6', '#a1d0b6', '#4bad9f', '#658f83',
    '#cc9b45', '#f3ce70', '#ead5a0', '#dea668', '#b88444',
    '#b9557a', '#e783a3', '#f2b1be', '#c7799a', '#98667f'];
  colors.forEach((color, i) => {
    x.save(); x.translate(i % 4 * 256, Math.floor(i / 4) * 256);
    x.beginPath(); x.rect(0, 0, 256, 256); x.clip();
    x.fillStyle = color; x.fillRect(0, 0, 256, 256);
    if (i % 2 === 0) {
      // Two translucent crossing stripes create the three tones of gingham.
      x.fillStyle = 'rgba(255, 249, 223, .52)';
      for (let k = 0; k < 256; k += 64) { x.fillRect(k, 0, 32, 256); x.fillRect(0, k, 256, 32); }
    } else {
      x.fillStyle = 'rgba(255, 250, 227, .85)';
      for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
        x.beginPath(); x.arc(12 + col * 48 + row % 2 * 24, 12 + row * 48, 8.5, 0, TAU); x.fill();
      }
    }
    for (let k = 0; k < 900; k++) {
      x.fillStyle = k % 2 ? 'rgba(255, 252, 231, .10)' : 'rgba(86, 110, 86, .045)';
      x.fillRect(random(i * 901 + k) * 256, random(i * 901 + k + 91) * 256, 1.2, 1.2);
    }
    x.restore();
  });
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 8;
  return texture;
}

function makeStarGeometry() {
  // Rounded five-point outline, inflated on both faces: even edge-on it has volume.
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 18 : 33;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const shape = new THREE.Shape();
  points.forEach((p, i) => {
    const a = p.clone().lerp(points[(i + 9) % 10], .16), b = p.clone().lerp(points[(i + 1) % 10], .16);
    if (i === 0) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  shape.closePath();
  const outline = shape.getPoints(3); outline.pop();
  const positions = [0, 0, 12], uvs = [.5, .5], indices = [], n = outline.length;
  const rings = [[.4, 11], [.76, 8.7], [.94, 4.5], [1, 0], [.94, -4.5], [.76, -8.7], [.4, -11]];
  for (const [scale, z] of rings) for (const p of outline) {
    positions.push(p.x * scale, p.y * scale, z); uvs.push(p.x * scale / 66 + .5, p.y * scale / 66 + .5);
  }
  const back = positions.length / 3; positions.push(0, 0, -12); uvs.push(.5, .5);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(0, 1 + i, 1 + j);
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const a = 1 + ring * n + i, b = 1 + ring * n + j, c = a + n, d = b + n;
      indices.push(a, c, b, b, c, d);
    }
    indices.push(back, 1 + (rings.length - 1) * n + j, 1 + (rings.length - 1) * n + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

function makePapers() {
  uniforms = { map: { value: makeAtlas() }, uTime: { value: 0 },
    fogColor: { value: new THREE.Vector3(232 / 255, 233 / 255, 206 / 255) },
    fogNear: { value: 2600 }, fogFar: { value: 9500 }, uFocus: { value: 1300 }, uRange: { value: 1300 } };
  const geometry = makeStarGeometry();
  const cells = new Float32Array(540 * 2), seeds = new Float32Array(540);
  for (let i = 0; i < 540; i++) {
    const r = Array.from({ length: 7 }, (_, j) => random(i * 7 + j + 47));
    // Interleave equal hue families across existing random positions, including mobile's first 240.
    const cell = (i % 3) * 5 + Math.floor(random(i + 3701) * 5);
    cells[i * 2] = cell % 4; cells[i * 2 + 1] = 3 - Math.floor(cell / 4); seeds[i] = random(i + 8);
    notes.push({ r, delay: random(i + 4901), lead: random(i + 6101) < .6,
      ox: 0, oy: 0, vx: 0, vy: 0, spin: 0, angle: 0 });
  }
  geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({ uniforms,
    vertexShader: `attribute vec2 aCell; attribute float aSeed;
      varying vec2 vUv; varying float vD,vSeed; varying vec3 vNormal,vView;
      void main() {
        vUv=(uv*.96+.02+aCell)*.25; vSeed=aSeed;
        mat4 mm=modelViewMatrix*instanceMatrix; vec4 mv=mm*vec4(position,1.);
        vNormal=normalize(mat3(mm)*normal); vView=-mv.xyz; vD=-mv.z;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime;
      uniform vec3 fogColor; uniform float fogNear,fogFar,uFocus,uRange;
      varying vec2 vUv; varying float vD,vSeed; varying vec3 vNormal,vView;
      void main() {
        vec3 c=texture2D(map,vUv).rgb, n=normalize(vNormal), eye=normalize(vView);
        vec3 light=normalize(vec3(-.45,.75,1.));
        float diffuse=max(0.,dot(n,light));
        // A normalized dot can round slightly above 1 on the GPU.
        // Clamp before the fractional power so transmission never samples NaN.
        float rim=pow(1.-clamp(dot(n,eye),0.,1.),2.4);
        float shine=pow(max(0.,dot(n,normalize(light+eye))),32.);
        float breathe=.94+.06*sin(uTime*.9+vSeed*6.2831);
        vec3 col=c*(.60+.43*diffuse+.12*breathe);
        col+=vec3(1.,.96,.80)*(shine*.32+rim*.34)*breathe;
        float bl=clamp(abs(vD-uFocus)/uRange,0.,1.); bl=bl*bl*(3.-2.*bl);
        col=mix(col,fogColor,bl*.14);
        float f=smoothstep(fogNear,fogFar,vD)*.65; gl_FragColor=vec4(mix(col,fogColor,f),1.);
      }`
  });
  flock = new THREE.InstancedMesh(geometry, material, 540); flock.frustumCulled = false;
  flock.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(flock);
  // One soft halo per star shares its transform buffer; no per-star light or bloom pass.
  const glowGeometry = new THREE.PlaneGeometry(112, 112);
  glowGeometry.setAttribute('aCell', geometry.attributes.aCell); glowGeometry.setAttribute('aSeed', geometry.attributes.aSeed);
  const glowMaterial = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
    vertexShader: `attribute vec2 aCell; attribute float aSeed;
      varying vec2 vUv,vCell; varying float vD,vSeed;
      void main() {
        vUv=uv; vCell=aCell; vSeed=aSeed;
        vec4 mv=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        mv.xy+=position.xy*length(instanceMatrix[0].xyz); vD=-mv.z;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime,fogNear,fogFar;
      varying vec2 vUv,vCell; varying float vD,vSeed;
      void main() {
        vec2 p=(vUv-.5)*2.; float r=dot(p,p);
        float a=exp(-r*5.)*(1.-smoothstep(.45,1.,r))*.23;
        a*=1.-smoothstep(fogNear,fogFar,vD); a*=.94+.06*sin(uTime*.9+vSeed*6.2831);
        vec3 color=mix(texture2D(map,(vCell+.06)*.25).rgb,vec3(1.,.98,.82),.6);
        gl_FragColor=vec4(color,a);
      }`
  });
  starGlow = new THREE.InstancedMesh(glowGeometry, glowMaterial, 540); starGlow.frustumCulled = false;
  starGlow.instanceMatrix = flock.instanceMatrix; scene.add(starGlow);
}

function logoCanvas() {
  const c = document.createElement('canvas'); c.width = win.SW; c.height = win.SH;
  const x = c.getContext('2d'), port = win.SW < 1000;
  // Visible artwork bounds omit the transparent margin without changing the approved image.
  const lw = port ? c.width * .74 : Math.min(1640 * .56, 2 * cameraDistance * FOV2 * camera.aspect * .70);
  const lh = lw * 675 / 1666;
  const top = c.height * (port ? .45 : .5) - lh / 2;
  x.drawImage(logoImage, 70, 122, 1666, 675, (c.width - lw) / 2, top, lw, lh);
  // Print the sticker on the actual hinged entrance pane, above the fixed scroll hint.
  // Sample only the artwork bounds; keep the approved source image untouched.
  const pw = win.cw * .66, ph = pw * 482 / 1358;
  x.drawImage(pushImage, 316, 162, 1358, 482,
    (c.width - pw) / 2, c.height - win.ch * 1.80 - ph / 2, pw, ph);
  return c;
}

function makePaneGeometry(w, h) {
  const x = -w / 2, y = -h / 2, r = 3.5;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r); shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h); shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r); shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const outline = shape.getSpacedPoints(64); outline.pop();
  const positions = [0, 0, 6.3], uvs = [.5, .5], indices = [], n = outline.length;
  // A raised rolled rim gives each pane a visible inner shoulder and outer bevel head-on.
  const rings = [[.60, 6.2], [.78, 6], [.85, 8.4], [.91, 12], [.96, 9], [1, 0],
    [.99, -3], [.95, -6], [.88, -7.3], [.70, -7.7]];
  for (const [scale, z] of rings) for (const p of outline) {
    positions.push(p.x * scale, p.y * scale, z); uvs.push(p.x * scale / w + .5, p.y * scale / h + .5);
  }
  const back = positions.length / 3; positions.push(0, 0, -7.8); uvs.push(.5, .5);
  const front = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(0, 1 + i, 1 + j); front.push(0, 1 + i, 1 + j);
    for (let k = 0; k < rings.length - 1; k++) {
      const a = 1 + k * n + i, b = 1 + k * n + j, c = a + n, d = b + n;
      indices.push(a, c, b, b, c, d);
      if (k < 5) front.push(a, c, b, b, c, d);
    }
    indices.push(back, 1 + (rings.length - 1) * n + j, 1 + (rings.length - 1) * n + i);
  }
  const glass = new THREE.BufferGeometry();
  glass.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  glass.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); glass.setIndex(indices);
  glass.computeVertexNormals(); glass.computeBoundingSphere();
  const print = glass.clone(); print.setIndex(front); print.translate(0, 0, .18);
  return { glass, print };
}

function buildWindow() {
  if (windowGroup) {
    const geometries = new Set(), materials = new Set();
    windowGroup.traverse((o) => { if (o.geometry) geometries.add(o.geometry); if (o.material && o.material !== frameMaterial && o.material !== glassMaterial) materials.add(o.material); });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); logoTexture.dispose(); scene.remove(windowGroup);
  }
  windowGroup = new THREE.Group(); scene.add(windowGroup); panes = []; lastCell = null;
  const { SW, SH, cols, rows, cw, ch } = win, x0 = -SW / 2;
  const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 22), frameMaterial); m.position.set(x, y, 0); windowGroup.add(m); };
  for (let i = 0; i <= cols; i++) bar(i === 0 || i === cols ? 10 : 4, SH + 10, x0 + i * cw, FLOOR + SH / 2);
  for (let j = 0; j <= rows; j++) bar(SW + 10, j === 0 || j === rows ? 10 : 4, 0, FLOOR + j * ch);
  const wall = new THREE.MeshStandardMaterial({ color: BG, roughness: .9 });
  for (const [x, y, w, h] of [[-SW / 2 - 3000, win.cy, 6000, SH + 6000], [SW / 2 + 3000, win.cy, 6000, SH + 6000], [0, FLOOR + SH + 3000, SW, 6000]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wall); m.position.set(x, y, -16); windowGroup.add(m);
  }
  logoTexture = new THREE.CanvasTexture(logoCanvas()); logoTexture.colorSpace = THREE.SRGBColorSpace; logoTexture.anisotropy = 8;
  const ink = new THREE.MeshBasicMaterial({ map: logoTexture, alphaTest: .1, transparent: true, toneMapped: false, side: THREE.DoubleSide });
  const gw = cw - 6, gh = ch - 6, paneGeometry = makePaneGeometry(gw, gh);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const group = new THREE.Group(), cx = x0 + cw * (i + .5), cy = FLOOR + ch * (j + .5);
    group.position.set(cx, cy, 0); windowGroup.add(group); group.add(new THREE.Mesh(paneGeometry.glass, glassMaterial));
    const geometry = paneGeometry.print.clone(), uv = geometry.attributes.uv;
    const u0 = (cx - gw / 2 - x0) / SW, v0 = (cy - gh / 2 - FLOOR) / SH;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + gw / SW * uv.getX(k), v0 + gh / SH * uv.getY(k));
    group.add(new THREE.Mesh(geometry, ink));
    const angle = 0; group.rotation.y = angle;
    panes.push({ group, i, j, angle, velocity: 0, door: i === Math.floor(cols / 2) && j === 1 });
  }
  paneGeometry.print.dispose();
}

function buildPath() {
  const port = camera.aspect < .9, dy = FLOOR + win.ch * 1.5, x = port ? 0 : -540;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // First four keys match S0 -> S1. The fifth preserves the original tangent at S1.
  const positions = [V(0, win.cy, cameraDistance), V(0, dy, Math.min(640, cameraDistance * .55)),
    V(0, dy, -380), V(x, -60, -2300), V(-640, 120, -5300)];
  const targets = [V(0, win.cy, 0), V(0, dy, 0), V(0, dy + 20, -2200), V(x, -60, -4600), V(-1250, 230, -9000)];
  cameraPath = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', .4);
  lookPath = new THREE.CatmullRomCurve3(targets, false, 'catmullrom', .4);
  const fwd = targets[3].clone().sub(positions[3]).normalize(), side = fwd.clone().cross(worldUp).normalize();
  insideFrame = { p: positions[3], fwd, side, up: side.clone().cross(fwd) };
}

function layout() {
  const progress = journey;
  scrollJourney?.interrupt();
  width = innerWidth; height = innerHeight; renderer.setSize(width, height, false);
  backdrop.material.uniforms.viewportHeight.value = height;
  camera.aspect = width / height; camera.updateProjectionMatrix(); const port = camera.aspect < .9;
  backdrop.material.uniforms.washScale.value.x = 8600 * Math.min(1, camera.aspect / 1.2);
  win = port ? { SW: 800, SH: 1665, cols: 7, rows: 15 } : { SW: 1640, SH: 1000, cols: 13, rows: 9 };
  if (!port && camera.aspect > 1.8) { win.cols = Math.min(19, 2 * Math.round(13 * camera.aspect / 1.64 / 2 - .5) + 1); win.SW = 1640 / 13 * win.cols; }
  win.cw = win.SW / win.cols; win.ch = win.SH / win.rows; win.cy = FLOOR + win.SH / 2;
  cameraDistance = Math.min(win.SW / (2 * FOV2 * camera.aspect), win.SH / (2 * FOV2)) * (port ? .93 : .9);
  buildPath(); step = Math.max(200, height) * 1.7;
  $('scroll-space').style.height = `${height + step * END}px`;
  scrollTo(0, progress * step);
  scrollJourney?.refresh();
  flock.count = Math.min(width, height) < 700 ? 240 : 540;
  buildWindow(); render(0);
}

function insidePaper(i, t, out) {
  const r = notes[i].r, F = insideFrame;
  let u, v, distance;
  if (i < 40 && i % 8 === 1) {
    const slot = nearSlots[Math.floor(i / 8)];
    u = slot[0] + (r[1] - .5) * .08 + Math.sin(t * .5 + r[2] * 6) * .035;
    v = slot[1] + (r[2] - .5) * .1 + Math.sin(t * .8 + r[3] * 6) * .05;
    distance = (720 + r[3] * 380) * 1.25;
  } else if (r[6] < .51) {
    const radius = 520 + Math.pow(r[2], .9) * 780;
    const speed = (.3 + .5 * r[3]) / Math.sqrt(radius / 400) * .34 * (r[4] < .15 ? -1 : 1);
    const angle = r[0] * TAU + t * speed;
    return out.set(Math.cos(angle) * radius, -110 + (r[1] - .5) * (520 + radius * .5) + Math.sin(t * .6 + r[3] * 6) * 30,
      -4600 + Math.sin(angle) * radius * .95);
  } else {
    u = (r[0] - .5) * 3.4; v = (r[1] - .5) * 2.6; distance = 2700 + r[2] * 4200;
    if (Math.abs(u) < 1.05 && Math.abs(v) < 1.05 && distance < 3300) u += u < 0 ? -1 : 1;
    u += Math.sin(t * .12 + r[4] * 6) * .05;
  }
  const hh = distance * FOV2;
  return out.copy(F.p).addScaledVector(F.fwd, distance).addScaledVector(F.side, u * hh * camera.aspect).addScaledVector(F.up, v * hh);
}

function leadPaper(i, t, out) {
  const r = notes[i].r, s = (r[0] + t * .01 * (.5 + r[1])) % 1;
  const u = .75 * (.64 + (.96 - .64) * s);
  cameraPath.getPoint(u, out); cameraPath.getTangent(u, pathTangent);
  pathSide.crossVectors(worldUp, pathTangent).normalize(); pathUp.crossVectors(pathTangent, pathSide).normalize();
  const radius = 320 + Math.pow(r[2], 1.2) * 1000, angle = r[3] * TAU + t * (.15 + r[4] * .2);
  return out.addScaledVector(pathSide, Math.cos(angle) * radius).addScaledVector(pathUp, Math.sin(angle) * radius * .8);
}

function updatePapers(dt) {
  right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
  uniforms.uTime.value = elapsed;
  const transit = Math.pow(Math.max(0,Math.sin(Math.PI * Math.min(1,journey))), 1.1), blend = smooth(journey);
  uniforms.uFocus.value = THREE.MathUtils.lerp(1300 + 1000 * blend, 700, transit);
  uniforms.uRange.value = THREE.MathUtils.lerp(1300 + 200 * blend, 900, transit);
  for (let i = 0; i < flock.count; i++) {
    const n = notes[i], r = n.r;
    dummy.position.set((r[0] - .5) * win.SW * .95, FLOOR + 60 + r[1] * win.SH * .85, -260 - r[2] * 1500);
    if (journey > .0005) {
      insidePaper(i, elapsed, paperEnd);
      dummy.position.lerp(paperEnd, smooth((journey - n.delay * .3) / .7));
      if (n.lead && transit > 0) dummy.position.lerp(leadPaper(i, elapsed, paperLead), transit * (.75 + .25 * r[5]));
    }
    projected.copy(dummy.position).project(camera);
    const dx = (projected.x * .5 + .5) * width - pointer.x, dy = (-projected.y * .5 + .5) * height - pointer.y, d2 = dx * dx + dy * dy;
    if (projected.z < 1 && d2 < 22500 && !reduced.matches && !paused) {
      const k = 1 - d2 / 22500, inv = 1 / Math.sqrt(d2 + 1);
      n.vx += (pointer.vx * .9 + dx * inv * 900) * k * dt; n.vy += (pointer.vy * .9 + dy * inv * 900) * k * dt;
      n.spin += k * dt * (Math.abs(pointer.vx) + Math.abs(pointer.vy)) * .004;
    }
    n.ox += n.vx * dt; n.oy += n.vy * dt;
    n.vx += (-n.ox * 4 - n.vx * 2.2) * dt; n.vy += (-n.oy * 4 - n.vy * 2.2) * dt;
    const dep = Math.max(80, -depth.copy(dummy.position).applyMatrix4(camera.matrixWorldInverse).z), kk = 2 * dep * FOV2 / height;
    dummy.position.addScaledVector(right, n.ox * kk).addScaledVector(up, -n.oy * kk);
    if (dummy.position.y < FLOOR + 62) dummy.position.y = FLOOR + 62 + (FLOOR + 62 - dummy.position.y) * .12;
    n.spin *= Math.exp(-dt * 1.2); n.angle += n.spin * dt * 8;
    const rs = (r[5] - .5) * .9;
    dummy.rotation.set(r[2] * TAU + elapsed * rs * .6 + n.angle, r[3] * TAU + elapsed * rs + n.angle * .6, r[4] * TAU + elapsed * rs * .3);
    dummy.scale.setScalar(.75 + r[1] * .7); dummy.updateMatrix(); flock.setMatrixAt(i, dummy.matrix);
  }
  flock.instanceMatrix.needsUpdate = true; starGlow.count = flock.count;
}

function render(dt) {
  const pathProgress = smooth(journey) * .75;
  cameraPath.getPoint(pathProgress, camera.position); lookPath.getPoint(pathProgress, target);
  const storyJourney = journey <= 1 ? journey : Math.max(1, journey - INTRO_LENGTH);
  // Formation timing pauses for the greeting; camera travel must not pause with it.
  const advance = Math.max(0, journey - 1);
  camera.position.z -= advance * 1300; target.z -= advance * 1300;
  const follow = 1 - Math.exp(-dt * 8);
  viewPointer.x += (pointer.mx - viewPointer.x) * follow;
  viewPointer.y += (pointer.my - viewPointer.y) * follow;
  // Keep the interior camera steady; hover belongs to each object.
  const tilt = reduced.matches ? 0 : .35 * (1 - smooth(journey / .5));
  camera.position.x += viewPointer.x * 40 * tilt; camera.position.y -= viewPointer.y * 24 * tilt;
  target.x += viewPointer.x * 120 * tilt; target.y -= viewPointer.y * 80 * tilt;
  for (const hover of workHovers) {
    const active = !reduced.matches && hover.slot.getAttribute('aria-hidden') === 'false';
    if (reduced.matches) hover.x = hover.y = hover.vx = hover.vy = 0;
    else {
      // An underdamped spring lets the picture coast, overshoot and settle.
      const steps = Math.ceil(dt * 120), h = steps ? dt / steps : 0;
      for (let i = 0; i < steps; i++) {
        hover.vx += (((active ? hover.tx : 0) - hover.x) * 36 - hover.vx * 5) * h;
        hover.vy += (((active ? hover.ty : 0) - hover.y) * 36 - hover.vy * 5) * h;
        hover.x += hover.vx * h; hover.y += hover.vy * h;
      }
    }
    hover.art.style.transform = `perspective(1000px) translate3d(${hover.x * 10}px,${hover.y * 7}px,0) rotateX(${-hover.y * 8}deg) rotateY(${hover.x * 12}deg) rotateZ(${hover.x * 3}deg)`;
  }
  camera.lookAt(target); camera.updateMatrixWorld();
  const doorAngle = ease(smooth((journey - .02) / .4)) * Math.PI / 2;
  for (const p of panes) {
    const home = Math.round(p.angle / TAU) * TAU;
    p.velocity += (-9 * (p.angle - home) - 1.5 * p.velocity) * dt; p.angle += p.velocity * dt;
    p.group.rotation.y = p.angle + (p.door ? doorAngle : 0);
  }
  windowGroup.visible = camera.position.z > -80;
  const stage = journey < .02 ? 'door' : journey > .98 ? 'inside' : 'passing';
  if (document.body.dataset.stage !== stage) {
    document.body.dataset.stage = stage;
    $('hint').hidden = stage !== 'door';
  }
  updatePapers(dt);
  if (story) story.update(storyJourney, elapsed, camera, reduced.matches ? {mx:0,my:0} : pointer, dt, {width,height,reducedMotion:reduced.matches});
  // Use the same signed depth and opacity envelope as the artwork planes.
  const introPlane = sceneDepth(journey - 1.4);
  const introScale = reduced.matches ? 1 : introPlane.scale;
  const introOpacity = introPlane.opacity * smooth((journey - .78) / .22);
  const intro = $('intro');
  intro.style.opacity = introOpacity;
  intro.style.visibility = introOpacity > .001 ? 'visible' : 'hidden';
  intro.setAttribute('aria-hidden', String(introOpacity < .5));
  intro.style.transform = `translateY(-50%) scale(${introScale})`;
  const contactOpacity = smooth((storyJourney - 5.38) / .90);
  const contact = $('contact');
  contact.style.opacity = contactOpacity;
  contact.style.visibility = contactOpacity > .001 ? 'visible' : 'hidden';
  contact.style.transform = `translateY(calc(-50% + ${(1-contactOpacity)*(reduced.matches?0:12)}px))`;
  contact.setAttribute('aria-hidden', String(contactOpacity < .5));
  contact.inert = contactOpacity < .5;
  mood.value = Math.max(0, storyJourney-1);
  const night = smooth((mood.value - 4.31) / .87);
  document.body.style.setProperty('--night', night);
  uniforms.fogColor.value.set(THREE.MathUtils.lerp(232/255,.13,night), THREE.MathUtils.lerp(233/255,.13,night), THREE.MathUtils.lerp(206/255,.15,night));
  const ink = (a,b) => `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*night)).join(',')})`;
  contact.style.setProperty('--contact-ink', ink([124,116,107],[219,215,205]));
  contact.style.setProperty('--contact-heading', ink([60,60,57],[244,240,229]));
  contact.style.setProperty('--contact-line', ink([154,144,133],[135,135,143]));
  renderer.render(scene, camera);
  window.__ready = true;
}

function animate(now) {
  raf = 0; const wallDt = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, .15);
  const dt = Math.min(wallDt,.035); previousTime = now;
  const motionDt = paused || reduced.matches ? 0 : dt;
  grainTime.value += paused || reduced.matches ? 0 : wallDt;
  elapsed += motionDt; render(motionDt); pointer.vx *= Math.exp(-dt * 7); pointer.vy *= Math.exp(-dt * 7); requestFrame();
}
function requestFrame() {
  if (!raf && !document.hidden && !paused) raf = requestAnimationFrame(animate);
}
function syncPause() {
  cancelAnimationFrame(raf); raf = 0; previousTime = null; requestFrame();
}

function movePointer(event) {
  const now = performance.now(), first = !pointer.at, dt = Math.max(8, now - pointer.at) / 1000;
  pointer.vx = first ? 0 : clamp((event.clientX - pointer.x) / dt, -6000, 6000);
  pointer.vy = first ? 0 : clamp((event.clientY - pointer.y) / dt, -6000, 6000);
  pointer.speed = Math.hypot(pointer.vx, pointer.vy); pointer.x = event.clientX; pointer.y = event.clientY;
  pointer.mx = pointer.x / width - .5; pointer.my = pointer.y / height - .5; pointer.at = now;
  if (paused || reduced.matches || journey > .35) return;
  ndc.set(pointer.x / width * 2 - 1, -pointer.y / height * 2 + 1); ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(plane, hit)) return;
  const i = Math.floor((hit.x + win.SW / 2) / win.cw), j = Math.floor((hit.y - FLOOR) / win.ch);
  const pane = panes.find((p) => p.i === i && p.j === j);
  if (pane && pane !== lastCell) {
    const sign = (pointer.vx >= 0 ? 1 : -1) * (i % 2 ? 1 : -1) * (Math.abs(pointer.vx) > Math.abs(pointer.vy) ? 1 : pointer.vy > 0 ? 1 : -1);
    pane.velocity += sign * (3 + Math.min(26, pointer.speed / 140));
    panes.forEach((p) => { if (Math.abs(p.i - i) + Math.abs(p.j - j) === 1) p.velocity += sign * Math.min(9, pointer.speed / 420); });
  }
  lastCell = pane;
}

async function init() {
  window.__STUDY_BOOTED = true;
  // Opened straight from disk? Local images would taint the canvas, so swap in
  // data-URI copies (same pixels) to keep pixel readback and WebGL uploads legal.
  const needsInline = location.protocol === 'file:' || new URLSearchParams(location.search).has('inline');
  let sources = null;
  if (needsInline) {
    try { sources = await import('./assets/inline-images.js'); } catch (e) { sources = null; }
  }
  const logoSource = sources?.LOGO_SRC || new URL('./assets/title-previews/yuhan-studio-crayon.png', import.meta.url).href;
  const pushSource = sources?.PUSH_SRC || new URL('./assets/push-crayon-label.png', import.meta.url).href;
  logoImage = new Image(); logoImage.src = logoSource;
  await logoImage.decode();
  // Recolour only neutral black ink; saturated star and spiral decorations retain their RGB.
  const lightLogo = document.createElement('canvas');
  lightLogo.width = logoImage.naturalWidth; lightLogo.height = logoImage.naturalHeight;
  const logoContext = lightLogo.getContext('2d');
  logoContext.drawImage(logoImage, 0, 0);
  const logoPixels = logoContext.getImageData(0, 0, lightLogo.width, lightLogo.height);
  for (let i = 0; i < logoPixels.data.length; i += 4) {
    const d = logoPixels.data, high = Math.max(d[i],d[i+1],d[i+2]), low = Math.min(d[i],d[i+1],d[i+2]);
    if (high < 150 && high - low < 32) {
      const amount = (1-smooth((high-low-12)/20))*(1-smooth((high-95)/55));
      for (let c=0;c<3;c++) d[i+c] += (242-d[i+c])*amount;
    }
  }
  logoContext.putImageData(logoPixels, 0, 0);
  document.querySelector('.signature-night').src = lightLogo.toDataURL();
  pushImage = new Image(); pushImage.src = pushSource;
  await pushImage.decode();
  renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene(); scene.background = new THREE.Color(BG); scene.fog = new THREE.Fog(BG, 2600, 9500);
  camera = new THREE.PerspectiveCamera(40, 1, 5, 40000);
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  room.traverse((object) => {
    if (!object.material?.isMeshBasicMaterial) return;
    const tint = object.position.x < -10 ? '#ffd6e0' : object.position.x > 10 ? '#c9ebdc' : '#fff3ce';
    object.material.color.multiply(new THREE.Color(tint));
  });
  scene.environment = pmrem.fromScene(room, .04).texture; room.dispose(); pmrem.dispose();
  frameMaterial = new THREE.MeshStandardMaterial({ color: '#D9DCDE', metalness: .9, roughness: .32, envMapIntensity: 1.2 });
  glassMaterial = new THREE.MeshPhysicalMaterial({ toneMapped: false, color: '#fff', transmission: 1, roughness: .2, thickness: 20, ior: 1.5,
    attenuationColor: '#e3ece1', attenuationDistance: 220, metalness: 0, envMapIntensity: .62, specularIntensity: .9, clearcoat: .12, clearcoatRoughness: .13 });
  glassMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec2 vPaneUv,vPaneSeed;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaneUv=uv; vPaneSeed=modelMatrix[3].xy*.09;');
    shader.fragmentShader = `varying vec2 vPaneUv,vPaneSeed;
      float glassNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1.,0.),vec2(127.1,311.7)),
          dot(i+vec2(0.,1.),vec2(127.1,311.7)),dot(i+1.,vec2(127.1,311.7))))*43758.5453);
        return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
      }
      ` + shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nfloat edge=max(abs(vPaneUv.x-.5),abs(vPaneUv.y-.5))*2.;\nroughnessFactor=mix(.21,.12,smoothstep(.76,.90,edge));');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec2 ripple=vPaneUv*82.+vPaneSeed;
      float relief=glassNoise(ripple);
      vec2 waves=vec2(glassNoise(ripple+vec2(.3,0.)),glassNoise(ripple+vec2(0.,.3)))-relief;
      normal=normalize(normal+vec3(waves*.16*(1.-smoothstep(.76,.94,edge)),0.));`);
  };
  makeGrain(); makeBackdrop(); makeStarFloor(); makePapers(); story = createStory(scene, flock, starGlow); layout(); $('loading').hidden = true; syncPause();
  addEventListener('resize', layout);
  scrollJourney = createScrollJourney({
    gsap: window.gsap, ScrollTrigger: window.ScrollTrigger,
    getRange: () => step * END,
    stops: STOPS.map(stop => stop / END),
    isReducedMotion: () => reduced.matches,
    onProgress: progress => {
      journey = progress * END;
      // The animation loop owns drawing; paused scenes still need scroll updates.
      if (paused) render(0); else requestFrame();
    },
  });
  $('hint').addEventListener('click', () => scrollJourney.goTo(1.4 / END, reduced.matches));
  // Deep-link helper: ?p=0.46 jumps to a scroll chapter (used for previewing stills).
  const probe = parseFloat(new URLSearchParams(location.search).get('p'));
  if (!isNaN(probe)) setTimeout(() => { scrollTo(0, Math.max(0, Math.min(1, probe)) * step * END); ScrollTrigger.update(); }, 600);
  let copyTimer;
  $('copy-email').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('tuski567@qq.com');
      $('copy-email').textContent = 'COPIED';
      $('contact-status').textContent = '邮箱地址已复制';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { $('copy-email').textContent = 'COPY'; }, 1800);
    } catch {
      $('contact-status').textContent = '复制未成功，请选择邮箱地址手动复制';
    }
  });
  // Track across canvas, artwork and contact overlays without resetting at their edges.
  document.addEventListener('pointermove', movePointer);
  document.addEventListener('pointerdown', movePointer);
  const clearPointer = () => {
    pointer.x = pointer.y = -999; pointer.at = 0;
    pointer.mx = pointer.my = pointer.vx = pointer.vy = 0; lastCell = null;
    workHovers.forEach(hover => { hover.tx = hover.ty = 0; });
  };
  document.documentElement.addEventListener('pointerleave', clearPointer);
  addEventListener('blur', clearPointer);
  document.querySelectorAll('.work-slot').forEach((slot) => {
    const hover = { slot, art: slot.querySelector('.work-art'), x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    workHovers.push(hover);
    slot.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || reduced.matches) return;
      const rect = slot.getBoundingClientRect();
      hover.tx = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      hover.ty = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    });
    slot.addEventListener('pointerleave', () => { hover.tx = hover.ty = 0; });
  });
  reduced.addEventListener('change', () => { paused = reduced.matches; scrollJourney?.interrupt(); render(0); syncPause(); });
  document.addEventListener('visibilitychange', () => { previousTime = null; if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else requestFrame(); });
}

// 点击视频作品 → 全屏播放（带声音和进度条）；ESC / 点背景关闭。
function initVideoModal() {
  const modal = $('video-modal'), player = $('vm-video'), caption = $('vm-caption'), closeBtn = $('vm-close');
  if (!modal || !player) return;
  const close = () => {
    if (modal.hidden) return;
    player.pause();
    modal.hidden = true;
    document.documentElement.classList.remove('modal-open');
    document.querySelectorAll('.art-video').forEach((v) => { v.muted = true; v.play().catch(() => {}); });
  };
  document.querySelectorAll('.work-slot').forEach((slot) => {
    const inline = slot.querySelector('.art-video');
    if (!inline) return;
    slot.classList.add('has-video');
    inline.addEventListener('click', () => {
      if (slot.getAttribute('aria-hidden') === 'true') return;
      caption.textContent = slot.getAttribute('aria-label') || '';
      player.src = inline.currentSrc || inline.src;
      player.currentTime = inline.currentTime || 0;
      modal.hidden = false;
      document.documentElement.classList.add('modal-open');
      document.querySelectorAll('.art-video').forEach((v) => v.pause());
      player.muted = false;
      player.play().catch(() => {});
      closeBtn.focus();
    });
  });
  modal.querySelector('.vm-backdrop').addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
}
initVideoModal();

init().catch((error) => {
  $('loading').hidden = true; $('error').hidden = false; $('error').textContent = `小样暂时无法显示：${error.message}`;
  document.querySelectorAll('button').forEach((button) => { button.disabled = true; }); console.error(error);
});
