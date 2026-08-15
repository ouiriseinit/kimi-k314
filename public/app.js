import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const API_BASE = window.location.origin.replace(/^http/, 'ws');
let flightsData = [], selectedIcao = null, autoInterval = null;
let ws = null;

// ─── THREE.JS SETUP ───
const canvas = document.getElementById('globe-canvas');
const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 3.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.4;
controls.maxDistance = 6;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;

// ─── GLOBE ───
const GLOBE_RADIUS = 1.0;

const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
const earthMat = new THREE.MeshPhongMaterial({
  map: new THREE.TextureLoader().load('https://unpkg.com/three-globe/example/img/earth-night.jpg'),
  bumpMap: new THREE.TextureLoader().load('https://unpkg.com/three-globe/example/img/earth-topology.png'),
  bumpScale: 0.02,
  specular: new THREE.Color(0x111111),
  shininess: 5,
});
const earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 64, 64);
const atmoMat = new THREE.MeshBasicMaterial({
  color: 0x3b82f6,
  transparent: true,
  opacity: 0.08,
  side: THREE.BackSide
});
const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
scene.add(atmosphere);

const starsGeo = new THREE.BufferGeometry();
const starCount = 3000;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
  starPos[i] = (Math.random() - 0.5) * 40;
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.015, transparent: true, opacity: 0.6 });
scene.add(new THREE.Points(starsGeo, starsMat));

const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

// ─── PLANE MARKERS ───
const planeMarkers = new Map();
const TRAIL_LENGTH = 30;
const ARC_POINTS = 64;

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function getPlaneColor(flight) {
  if (flight.source === 'boot') return 0xff6b35;
  return flight.onGround ? 0x22c55e : 0x3b82f6;
}

function createPlaneMesh(flight) {
  const color = getPlaneColor(flight);
  const geo = new THREE.ConeGeometry(0.007, 0.022, 4);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);

  const spriteMat = new THREE.SpriteMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.05, 0.05, 1);
  mesh.add(sprite);

  // Trail
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL_LENGTH * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 });
  const trail = new THREE.Line(trailGeo, trailMat);
  scene.add(trail);

  // Arc path
  const arcGeo = new THREE.BufferGeometry();
  const arcPos = new Float32Array(ARC_POINTS * 3);
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arcMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.15 });
  const arcLine = new THREE.Line(arcGeo, arcMat);
  scene.add(arcLine);

  return { mesh, trail, arcLine, trailHistory: [] };
}

function updatePlanePosition(marker, flight) {
  const r = GLOBE_RADIUS + (flight.altitude || 0) * 0.000015;
  const pos = latLonToVector3(flight.lat, flight.lon, r);
  marker.mesh.position.copy(pos);

  const up = pos.clone().normalize();
  const headingRad = ((flight.heading || 0) - 90) * Math.PI / 180;
  const tangent = new THREE.Vector3(-Math.sin(headingRad), 0, Math.cos(headingRad));
  tangent.sub(up.clone().multiplyScalar(tangent.dot(up))).normalize();
  const binormal = new THREE.Vector3().crossVectors(up, tangent).normalize();
  marker.mesh.matrix.makeBasis(tangent, up, binormal);
  marker.mesh.matrixAutoUpdate = false;
  marker.mesh.updateMatrix();

  // Trail
  marker.trailHistory.push(pos.clone());
  if (marker.trailHistory.length > TRAIL_LENGTH) marker.trailHistory.shift();
  const arr = marker.trail.geometry.attributes.position.array;
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const p = marker.trailHistory[i] || pos;
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  marker.trail.geometry.attributes.position.needsUpdate = true;

  // Arc
  updateArcPath(marker, flight, pos, r);
}

function updateArcPath(marker, flight, currentPos, radius) {
  const heading = (flight.heading || 0) * Math.PI / 180;
  const speed = (flight.speed || 250) * 0.00002;
  const arcArr = marker.arcLine.geometry.attributes.position.array;

  for (let i = 0; i < ARC_POINTS; i++) {
    const t = i / (ARC_POINTS - 1);
    const arcDist = speed * t * 50;
    const arcLat = flight.lat + Math.cos(heading) * arcDist * 0.5;
    const arcLon = flight.lon + Math.sin(heading) * arcDist * 0.5;
    const arcR = radius + (flight.altitude || 0) * 0.000015 * (1 - t * 0.3);
    const arcPos = latLonToVector3(arcLat, arcLon, arcR);
    arcArr[i * 3] = arcPos.x;
    arcArr[i * 3 + 1] = arcPos.y;
    arcArr[i * 3 + 2] = arcPos.z;
  }
  marker.arcLine.geometry.attributes.position.needsUpdate = true;
}

function updatePlanes(flights) {
  const current = new Set(flights.map(f => f.icao));
  for (const [icao, marker] of planeMarkers) {
    if (!current.has(icao)) {
      scene.remove(marker.mesh);
      scene.remove(marker.trail);
      scene.remove(marker.arcLine);
      planeMarkers.delete(icao);
    }
  }
  for (const f of flights) {
    let marker = planeMarkers.get(f.icao);
    if (!marker) {
      marker = createPlaneMesh(f);
      scene.add(marker.mesh);
      planeMarkers.set(f.icao, marker);
    }
    const newColor = getPlaneColor(f);
    marker.mesh.material.color.setHex(newColor);
    marker.trail.material.color.setHex(newColor);
    marker.arcLine.material.color.setHex(newColor);
    updatePlanePosition(marker, f);
  }
}

// ─── RAYCASTER ───
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');

function getHoveredFlight() {
  raycaster.setFromCamera(mouse, camera);
  const meshes = Array.from(planeMarkers.values()).map(m => m.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length === 0) return null;
  let obj = hits[0].object;
  while (obj.parent && obj.parent.type !== 'Scene') obj = obj.parent;
  for (const [icao, marker] of planeMarkers) {
    if (marker.mesh === obj) {
      return flightsData.find(f => f.icao === icao);
    }
  }
  return null;
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const flight = getHoveredFlight();
  if (flight) {
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY + 12) + 'px';
    const sourceTag = flight.source === 'boot' ? '<span style="color:#ff6b35">[BOOT]</span> ' : '';
    tooltip.innerHTML = `${sourceTag}<strong>${flight.callsign || flight.icao}</strong><br><span style="color:#6b7280">${flight.origin || 'Unknown'}</span>`;
    tooltip.classList.add('show');
    canvas.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('show');
    canvas.style.cursor = 'grab';
  }
});

canvas.addEventListener('click', () => {
  const flight = getHoveredFlight();
  if (flight) selectFlight(flight);
});

// ─── WEBSOCKET ───
function connectWS() {
  const wsUrl = `${API_BASE}/flights`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WS] Connected');
    document.getElementById('source-label').innerHTML = '<span class="live-dot"></span><span class="source">WS CONNECTED</span>';
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'snapshot' || msg.type === 'update') {
      flightsData = msg.flights;
      updateSidebar({ flights: msg.flights, count: msg.flights.length, source: msg.source });
      updatePlanes(msg.flights);
      updateStats(msg.flights);
      const interpTag = msg.interpolated ? ' (interp)' : '';
      document.getElementById('source-label').innerHTML =
        `<span class="live-dot"></span><span class="source">${msg.source.toUpperCase()}</span> — ${msg.flights.length} flights${interpTag}`;
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected, retrying...');
    document.getElementById('source-label').textContent = 'WS reconnecting...';
    setTimeout(connectWS, 3000);
  };

  ws.onerror = (err) => {
    console.log('[WS] Error:', err);
  };
}

// ─── UI UPDATE FUNCTIONS ───
function updateSidebar(data) {
  const list = document.getElementById('flight-list');
  list.innerHTML = '';
  data.flights.forEach(f => {
    const item = document.createElement('div');
    item.className = 'flight-item';
    item.dataset.icao = f.icao;
    if (f.icao === selectedIcao) item.classList.add('active');
    const alt = f.altitude ? Math.round(f.altitude) : '—';
    const bootBadge = f.source === 'boot' ? '<span style="color:#ff6b35;font-size:0.7rem">[BOOT]</span> ' : '';
    item.innerHTML = `
      <div class="flight-icon">&#9992;&#65039;</div>
      <div class="flight-info">
        <div class="callsign">${bootBadge}${f.callsign || f.icao}</div>
        <div class="meta">${f.origin || 'Unknown'} · ${f.icao}</div>
      </div>
      <div class="flight-alt">${alt}<span class="unit">m</span></div>`;
    item.addEventListener('click', () => selectFlight(f));
    list.appendChild(item);
  });
}

function selectFlight(f) {
  selectedIcao = f.icao;
  document.querySelectorAll('.flight-item').forEach(el =>
    el.classList.toggle('active', el.dataset.icao === f.icao));
  const panel = document.getElementById('detail-panel');
  panel.classList.add('show');
  document.getElementById('detail-callsign').textContent = f.callsign || f.icao;
  document.getElementById('detail-icao').textContent = f.icao;
  document.getElementById('detail-origin').textContent = f.origin || 'Unknown';
  document.getElementById('detail-alt').textContent = f.altitude ? `${Math.round(f.altitude)} m` : '—';
  document.getElementById('detail-speed').textContent = f.speed ? `${Math.round(f.speed)} m/s` : '—';
  document.getElementById('detail-heading').textContent = f.heading ? `${Math.round(f.heading)}°` : '—';
  const st = document.getElementById('detail-status');
  st.textContent = f.onGround ? 'On Ground' : 'Airborne';
  st.className = 'value ' + (f.onGround ? 'on-ground' : 'airborne');

  const target = latLonToVector3(f.lat, f.lon, 4);
  const start = camera.position.clone();
  const duration = 1000;
  const startTime = performance.now();
  function animateCam(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(start, target, ease);
    camera.lookAt(0, 0, 0);
    if (t < 1) requestAnimationFrame(animateCam);
  }
  requestAnimationFrame(animateCam);
  controls.autoRotate = false;
}

function updateStats(flights) {
  document.getElementById('stat-total').textContent = flights.length;
  const alts = flights.map(f => f.altitude).filter(a => a !== null);
  const speeds = flights.map(f => f.speed).filter(s => s !== null);
  document.getElementById('stat-alt').textContent = alts.length ? Math.round(alts.reduce((a,b) => a+b, 0) / alts.length) : '—';
  document.getElementById('stat-speed').textContent = speeds.length ? Math.round(speeds.reduce((a,b) => a+b, 0) / speeds.length) : '—';
}

// ─── CONTROLS ───
document.getElementById('btn-refresh').addEventListener('click', () => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'request_update' }));
  }
});
document.getElementById('btn-auto').style.display = 'none'; // Auto is always on via WS
document.getElementById('search').addEventListener('input', () => {
  // Filter client-side since WS streams all data
  const term = document.getElementById('search').value.trim().toLowerCase();
  const filtered = term
    ? flightsData.filter(f =>
        f.callsign.toLowerCase().includes(term) ||
        f.icao.toLowerCase().includes(term)
      )
    : flightsData;
  updateSidebar({ flights: filtered, count: filtered.length, source: 'filtered' });
  updatePlanes(filtered);
});

// ─── RESIZE ───
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// ─── ANIMATION LOOP ───
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ─── INIT ───
connectWS();
animate();