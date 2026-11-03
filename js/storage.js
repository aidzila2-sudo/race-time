const STORAGE_KEY = "racebox:data:v1";
const ATTEMPT_LOG_PREFIX = "racebox:attempt-log:";
const TEMPLATES_VERSION_KEY = "racebox_templates_version";
const TEMPLATES_VERSION = "3";
const SESSIONS_VERSION_KEY = "racebox_sessions_version";
const SESSIONS_VERSION = "1";
const SPLITS_VERSION_KEY = "racebox_splits_version";
const SPLITS_VERSION = "2";
const DEFAULT_SPLIT_DISTANCES = [20, 100, 201, 203];
const LEGACY_DEFAULT_SPLIT_DISTANCES = [
  [21, 101, 201, 250],
  [18, 100, 201, 250]
];
const DEFAULT_TEMPLATES = [
  { id: "builtin-100m", name: "0 - 100 m", type: "distance", target: 100, builtIn: true },
  { id: "builtin-201m", name: "0 - 201 meter", type: "distance", target: 201, builtIn: true },
  { id: "builtin-402m", name: "0 - 402 m", type: "distance", target: 402, builtIn: true },
  { id: "builtin-500m", name: "0 - 500 m", type: "distance", target: 500, builtIn: true }
];

const DEFAULT_DATA = {
  user: null,
  bikes: [],
  templates: DEFAULT_TEMPLATES,
  history: [],
  dragSessions: [],
  activeDragSessionId: "",
  lastMotorName: "",
  unit: "kmh",
  useMotionSensor: true,
  splitDistances: DEFAULT_SPLIT_DISTANCES,
  oneFootRollout: true,
  activeBikeId: ""
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createDragSession(name, bikeProfile = null) {
  const session = {
    id: crypto.randomUUID(),
    bikeName: name,
    bikeProfile: bikeProfile ? { ...bikeProfile } : null,
    date: localDateKey(),
    createdAt: new Date().toISOString()
  };
  data.dragSessions = [session, ...data.dragSessions];
  data.activeDragSessionId = session.id;
  data.lastMotorName = name;
  persist();
  return session;
}

export function ensureDragSession(name, bikeProfile = null, forceNew = false) {
  const normalizedName = String(name || "").trim().slice(0, 40);
  if (!normalizedName) throw new Error("Nama motor wajib diisi.");
  const today = localDateKey();
  const active = data.dragSessions.find((session) => session.id === data.activeDragSessionId);
  if (!forceNew && active && active.bikeName === normalizedName && active.date === today) {
    if (bikeProfile && JSON.stringify(active.bikeProfile) !== JSON.stringify(bikeProfile)) {
      active.bikeProfile = { ...bikeProfile };
      persist();
    }
    data.lastMotorName = normalizedName;
    return active;
  }
  return createDragSession(normalizedName, bikeProfile);
}

export function addDragResult(result) {
  const session = data.dragSessions.find((item) => item.id === result.sessionId);
  if (!session) throw new Error("Sesi Drag tidak ditemukan.");
  const runNumber = data.history.filter((item) => item.sessionId === session.id && item.dragRun).length + 1;
  return addResult({
    ...result,
    dragRun: true,
    bikeName: session.bikeName,
    bikeProfile: session.bikeProfile,
    runNumber,
    sessionDate: session.date
  });
}

export function setLastMotorName(name) {
  data.lastMotorName = String(name || "").trim().slice(0, 40);
  persist();
}

export function getMotorNameSuggestions() {
  return [...new Set([
    ...data.history.map((result) => result.bikeName),
    ...data.bikes.map((bike) => bike.name)
  ].map((name) => String(name || "").trim()).filter(Boolean))];
}

export function startNewDragSession(name) {
  const normalizedName = String(name || "").trim().slice(0, 40);
  if (!normalizedName) throw new Error("Nama motor wajib diisi.");
  const bike = data.bikes.find((item) => item.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase());
  return createDragSession(normalizedName, bike ? { ...bike } : null);
}

export function renameDragSession(id, name) {
  const normalizedName = String(name || "").trim().slice(0, 40);
  if (!normalizedName) throw new Error("Nama motor wajib diisi.");
  const session = data.dragSessions.find((item) => item.id === id);
  if (!session) throw new Error("Sesi Drag tidak ditemukan.");
  session.bikeName = normalizedName;
  const bike = data.bikes.find((item) => item.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase());
  session.bikeProfile = bike ? { ...bike } : null;
  data.history = data.history.map((result) => result.sessionId === id
    ? { ...result, bikeName: normalizedName, bikeProfile: session.bikeProfile }
    : result);
  if (data.activeDragSessionId === id) data.lastMotorName = normalizedName;
  persist();
  return session;
}

export function deleteDragSession(id) {
  const runIds = data.history.filter((result) => result.sessionId === id).map((result) => result.id);
  runIds.forEach((runId) => localStorage.removeItem(`${ATTEMPT_LOG_PREFIX}${runId}`));
  data.history = data.history.filter((result) => result.sessionId !== id);
  data.dragSessions = data.dragSessions.filter((session) => session.id !== id);
  if (data.activeDragSessionId === id) data.activeDragSessionId = "";
  persist();
}

function readData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return clone(DEFAULT_DATA);
    return {
      ...clone(DEFAULT_DATA),
      ...saved,
      templates: Array.isArray(saved.templates) ? saved.templates : clone(DEFAULT_TEMPLATES),
      bikes: Array.isArray(saved.bikes) ? saved.bikes : [],
      history: Array.isArray(saved.history) ? saved.history : [],
      dragSessions: Array.isArray(saved.dragSessions) ? saved.dragSessions : [],
      activeDragSessionId: typeof saved.activeDragSessionId === "string" ? saved.activeDragSessionId : "",
      lastMotorName: typeof saved.lastMotorName === "string" ? saved.lastMotorName.slice(0, 40) : "",
      splitDistances: Array.isArray(saved.splitDistances)
        ? [...new Set(saved.splitDistances.map(Number).filter((distance) => Number.isFinite(distance) && distance > 0))].slice(0, 8)
        : [...DEFAULT_SPLIT_DISTANCES],
      oneFootRollout: saved.oneFootRollout !== false,
      activeBikeId: typeof saved.activeBikeId === "string" ? saved.activeBikeId : ""
    };
  } catch {
    return clone(DEFAULT_DATA);
  }
}

let data = readData();

function migrateSplitDistances() {
  if (localStorage.getItem(SPLITS_VERSION_KEY) === SPLITS_VERSION) return;

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
  }
  const savedDistances = Array.isArray(saved?.splitDistances)
    ? saved.splitDistances.map(Number)
    : null;
  const matchesLegacyDefault = savedDistances && LEGACY_DEFAULT_SPLIT_DISTANCES.some((legacy) =>
    savedDistances.length === legacy.length && savedDistances.every((distance, index) => distance === legacy[index]));
  if (!savedDistances || matchesLegacyDefault) {
    data.splitDistances = [...DEFAULT_SPLIT_DISTANCES];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  localStorage.setItem(SPLITS_VERSION_KEY, SPLITS_VERSION);
}

function migrateTemplates() {
  if (localStorage.getItem(TEMPLATES_VERSION_KEY) === TEMPLATES_VERSION) return;

  let changed = data.templates.some((template) => template.type === "speed");
  data.templates = data.templates.filter((template) => template.type !== "speed");
  DEFAULT_TEMPLATES.forEach((template) => {
    const existing = data.templates.find((item) => item.type === template.type && Number(item.target) === template.target);
    if (!existing) {
      data.templates.push(clone(template));
      changed = true;
    } else if (existing.builtIn && existing.name !== template.name) {
      existing.name = template.name;
      changed = true;
    }
  });

  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(TEMPLATES_VERSION_KEY, TEMPLATES_VERSION);
}

function migrateSessions() {
  if (localStorage.getItem(SESSIONS_VERSION_KEY) === SESSIONS_VERSION) return;
  data.history.forEach((result) => {
    if (result.dragRun && !data.dragSessions.some((session) => session.id === result.sessionId)) {
      result.beforeSessions = true;
      delete result.sessionId;
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(SESSIONS_VERSION_KEY, SESSIONS_VERSION);
}

migrateSplitDistances();
migrateTemplates();
migrateSessions();
const listeners = new Set();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  listeners.forEach((listener) => listener(getData()));
}

export function getData() {
  return clone(data);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUser(user) {
  data.user = user ? { ...user } : null;
  persist();
}

export function saveBike(bike) {
  const next = { ...bike, id: bike.id || crypto.randomUUID() };
  data.bikes = bike.id
    ? data.bikes.map((item) => item.id === bike.id ? next : item)
    : [...data.bikes, next];
  persist();
  return next;
}

export function deleteBike(id) {
  data.bikes = data.bikes.filter((bike) => bike.id !== id);
  if (data.activeBikeId === id) data.activeBikeId = "";
  persist();
}

export function addTemplate(template) {
  const next = { ...template, type: "distance", id: crypto.randomUUID(), builtIn: false };
  data.templates = [...data.templates, next];
  persist();
  return next;
}

export function deleteTemplate(id) {
  data.templates = data.templates.filter((template) => template.id !== id || template.builtIn);
  persist();
}

export function addResult(result) {
  const next = { ...result, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.history = [next, ...data.history];
  persist();
  return next;
}

export function deleteResult(id) {
  const removed = data.history.find((result) => result.id === id);
  localStorage.removeItem(`${ATTEMPT_LOG_PREFIX}${id}`);
  data.history = data.history.filter((result) => result.id !== id);
  if (removed?.sessionId) {
    data.history.filter((result) => result.sessionId === removed.sessionId)
      .sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt))
      .forEach((result, index) => {
        result.runNumber = index + 1;
      });
  }
  persist();
}

export function clearDragHistory() {
  data.history.filter((result) => result.dragRun).forEach((result) => {
    localStorage.removeItem(`${ATTEMPT_LOG_PREFIX}${result.id}`);
  });
  data.history = data.history.filter((result) => !result.dragRun);
  data.dragSessions = [];
  data.activeDragSessionId = "";
  persist();
}

export function saveAttemptLog(resultId, log) {
  localStorage.setItem(`${ATTEMPT_LOG_PREFIX}${resultId}`, JSON.stringify(log));
}

export function getAttemptLog(resultId) {
  const saved = localStorage.getItem(`${ATTEMPT_LOG_PREFIX}${resultId}`);
  return saved ? JSON.parse(saved) : [];
}

export function clearHistory() {
  data.history.forEach((result) => localStorage.removeItem(`${ATTEMPT_LOG_PREFIX}${result.id}`));
  data.history = [];
  persist();
}

export function clearLegacyHistory() {
  data.history.filter((result) => !result.dragRun).forEach((result) => {
    localStorage.removeItem(`${ATTEMPT_LOG_PREFIX}${result.id}`);
  });
  data.history = data.history.filter((result) => result.dragRun);
  persist();
}

export function setUnit(unit) {
  data.unit = unit === "mph" ? "mph" : "kmh";
  persist();
}

export function setUseMotionSensor(enabled) {
  data.useMotionSensor = Boolean(enabled);
  persist();
}

export function setDragSettings({ splitDistances = data.splitDistances, oneFootRollout = data.oneFootRollout } = {}) {
  const distances = [...new Set(splitDistances.map(Number)
    .filter((distance) => Number.isFinite(distance) && distance > 0))]
    .slice(0, 8);
  data.splitDistances = distances;
  data.oneFootRollout = Boolean(oneFootRollout);
  persist();
}

export function setActiveBike(id) {
  data.activeBikeId = data.bikes.some((bike) => bike.id === id) ? id : "";
  persist();
}

export function resetAllData() {
  const appKeys = [STORAGE_KEY, TEMPLATES_VERSION_KEY, SPLITS_VERSION_KEY, SESSIONS_VERSION_KEY];
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(ATTEMPT_LOG_PREFIX)) appKeys.push(key);
  });
  appKeys.forEach((key) => localStorage.removeItem(key));
  data = clone(DEFAULT_DATA);
  persist();
}
