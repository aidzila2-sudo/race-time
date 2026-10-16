const STORAGE_KEY = "racebox:data:v1";
const ATTEMPT_LOG_PREFIX = "racebox:attempt-log:";
const TEMPLATES_VERSION_KEY = "racebox_templates_version";
const TEMPLATES_VERSION = "2";

const DEFAULT_TEMPLATES = [
  { id: "builtin-0-60", name: "0-60 km/j", type: "speed", target: 60, builtIn: true },
  { id: "builtin-0-100", name: "0-100 km/j", type: "speed", target: 100, builtIn: true },
  { id: "builtin-100m", name: "0-100 m", type: "distance", target: 100, builtIn: true },
  { id: "builtin-201m", name: "0 - 201 meter", type: "distance", target: 201, builtIn: true },
  { id: "builtin-402m", name: "0 - 402 meter", type: "distance", target: 402, builtIn: true },
  { id: "builtin-500m", name: "0 - 500 meter", type: "distance", target: 500, builtIn: true }
];

const DEFAULT_DATA = {
  user: null,
  bikes: [],
  templates: DEFAULT_TEMPLATES,
  history: [],
  unit: "kmh",
  useMotionSensor: true
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
      history: Array.isArray(saved.history) ? saved.history : []
    };
  } catch {
    return clone(DEFAULT_DATA);
  }
}

let data = readData();

function migrateTemplates() {
  if (localStorage.getItem(TEMPLATES_VERSION_KEY) === TEMPLATES_VERSION) return;

  let changed = false;
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

migrateTemplates();
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
  persist();
}

export function addTemplate(template) {
  const next = { ...template, id: crypto.randomUUID(), builtIn: false };
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

export function setUnit(unit) {
  data.unit = unit === "mph" ? "mph" : "kmh";
  persist();
}

export function setUseMotionSensor(enabled) {
  data.useMotionSensor = Boolean(enabled);
  persist();
}
