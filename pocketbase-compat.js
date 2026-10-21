import PocketBase from "https://esm.sh/pocketbase@0.26.2";

export const PB_URL = "https://forcedatabase.dpdns.org";
export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const AUTH_COLLECTION = "users";
const DATA_COLLECTION = "app_data";
const UPLOAD_COLLECTION = "uploads";

const current = () => {
  const m = pb.authStore.model;
  if (!pb.authStore.isValid || !m) return null;
  return { uid: m.id, id: m.id, email: m.email || "", displayName: m.name || "", name: m.name || "", raw: m };
};
export const auth = {};
Object.defineProperty(auth, "currentUser", { get: current });

export function onAuthStateChanged(_auth, callback) {
  let alive = true;
  const fire = () => { if (alive) callback(current()); };
  const unsubscribe = pb.authStore.onChange(fire, true);
  queueMicrotask(fire);
  return () => { alive = false; unsubscribe(); };
}
export async function createUserWithEmailAndPassword(_auth, email, password) {
  const record = await pb.collection(AUTH_COLLECTION).create({
    email, password, passwordConfirm: password, emailVisibility: false, name: ""
  });
  await pb.collection(AUTH_COLLECTION).authWithPassword(email, password);
  return { user: current() || { uid: record.id, email, displayName: "" } };
}
export async function signInWithEmailAndPassword(_auth, email, password) {
  const result = await pb.collection(AUTH_COLLECTION).authWithPassword(email, password);
  return { user: { uid: result.record.id, id: result.record.id, email: result.record.email, displayName: result.record.name || "", raw: result.record } };
}
export async function signOut() { pb.authStore.clear(); }
export async function updateProfile(user, patch) {
  const name = patch.displayName ?? patch.name;
  if (name !== undefined && user?.uid) {
    await pb.collection(AUTH_COLLECTION).update(user.uid, { name });
  }
}
export async function deleteUser(user) {
  const id = user?.uid || pb.authStore.model?.id;
  if (!id) throw new Error("Нет активной сессии.");
  await pb.collection(AUTH_COLLECTION).delete(id);
  pb.authStore.clear();
}
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export async function reauthenticateWithCredential(user, credential) {
  return pb.collection(AUTH_COLLECTION).authWithPassword(credential.email, credential.password);
}
export async function setPersistence() { return true; }
export const browserLocalPersistence = "local";

const key = path => String(path || "").replace(/^\/+|\/+$/g, "");
const encode = value => JSON.stringify(value);
const decode = value => { try { return JSON.parse(value); } catch { return value; } };
const recordFilter = path => `path = ${JSON.stringify(path)}`;
const listRecords = async () => {
  const out = [];
  let page = 1;
  while (true) {
    const result = await pb.collection(DATA_COLLECTION).getList(page, 500, { sort: "path" });
    out.push(...result.items);
    if (page >= result.totalPages) break;
    page++;
  }
  return out;
};
async function findRecord(path) {
  try { return await pb.collection(DATA_COLLECTION).getFirstListItem(recordFilter(path)); }
  catch (e) { if (e?.status === 404) return null; throw e; }
}
async function writeNode(path, value) {
  const old = await findRecord(path);
  const body = { path, value: encode(value) };
  if (old) return pb.collection(DATA_COLLECTION).update(old.id, body);
  return pb.collection(DATA_COLLECTION).create(body);
}
async function deleteTree(path) {
  const prefix = path ? path + "/" : "";
  const records = await listRecords();
  const targets = records.filter(r => r.path === path || (prefix && r.path.startsWith(prefix)));
  await Promise.all(targets.map(r => pb.collection(DATA_COLLECTION).delete(r.id).catch(() => {})));
}
async function readTree(path) {
  const records = await listRecords();
  const prefix = path ? path + "/" : "";
  const relevant = records.filter(r => r.path === path || (prefix && r.path.startsWith(prefix)));
  const exact = relevant.find(r => r.path === path);
  if (!relevant.length) return { exists: false, value: null };
  let value = exact ? decode(exact.value) : {};
  for (const r of relevant) {
    if (r.path === path) continue;
    const rest = r.path.slice(prefix.length);
    const parts = rest.split("/");
    let target = value;
    if (target === null || typeof target !== "object" || Array.isArray(target)) value = target = {};
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== "object") target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = decode(r.value);
  }
  return { exists: true, value };
}
function snapshot(path, exists, value) {
  const children = value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value).map(([k,v]) => [k,v]) : [];
  return {
    key: path.split("/").pop() || null,
    exists: () => exists,
    val: () => value,
    forEach(fn) { for (const [k,v] of children) { if (fn({ key:k, val:()=>v, exists:()=>true, forEach:()=>{} }) === true) return true; } return false; }
  };
}
export function getDatabase() { return {}; }
export function ref(_db, path = "") { return { path: key(path), key: key(path).split("/").pop() || null }; }
export function query(reference, ...constraints) { return { ...reference, constraints }; }
export function orderByChild(field) { return { type:"orderByChild", field }; }
export function equalTo(value) { return { type:"equalTo", value }; }
export async function get(reference) {
  if (reference.path === ".info/connected") return snapshot(reference.path, true, true);
  const result = await readTree(reference.path);
  let value = result.value, exists = result.exists;
  const constraints = reference.constraints || [];
  const order = constraints.find(x => x.type === "orderByChild");
  const equal = constraints.find(x => x.type === "equalTo");
  if (order && equal) {
    const filtered = {};
    for (const [k,v] of Object.entries(value || {})) if (v?.[order.field] === equal.value) filtered[k] = v;
    value = filtered; exists = Object.keys(filtered).length > 0;
  }
  return snapshot(reference.path, exists, value);
}
export async function set(reference, value) {
  await deleteTree(reference.path);
  await writeNode(reference.path, value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k,v] of Object.entries(value)) await setChild(reference.path ? `${reference.path}/${k}` : k, v);
  }
}
async function setChild(path, value) {
  await writeNode(path, value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k,v] of Object.entries(value)) await setChild(`${path}/${k}`, v);
  }
}
export async function update(reference, patch) {
  const prior = await readTree(reference.path);
  const merged = { ...(prior.value && typeof prior.value === "object" ? prior.value : {}), ...patch };
  await set(reference, merged);
}
export async function remove(reference) { await deleteTree(reference.path); }
export function push(reference) {
  const key = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  return { path: reference.path ? `${reference.path}/${key}` : key, key };
}
export async function runTransaction(reference, updater) {
  const snap = await get(reference);
  const next = updater(snap.val());
  if (next === undefined) return { committed: false, snapshot: snap };
  await set(reference, next);
  return { committed: true, snapshot: await get(reference) };
}
export function onValue(reference, callback) {
  let active = true, busy = false, last = "";
  const tick = async () => {
    if (!active || busy) return;
    busy = true;
    try {
      const s = await get(reference);
      const serialized = encode(s.val());
      if (serialized !== last) { last = serialized; callback(s); }
    } catch (e) { console.error("PocketBase realtime read:", e); }
    finally { busy = false; }
  };
  tick();
  const timer = setInterval(tick, 3000);
  return () => { active = false; clearInterval(timer); };
}
export function onDisconnect() { return { set: async () => true }; }

/* Compatibility adapter for old Supabase Storage calls, backed by PocketBase files. */
const urlMapKey = "forceNetPocketBaseFileMap";
function fileMap() { try { return JSON.parse(localStorage.getItem(urlMapKey) || "{}"); } catch { return {}; } }
function saveFileMap(map) { localStorage.setItem(urlMapKey, JSON.stringify(map)); }
export const supabase = {
  storage: {
    from(_bucket) {
      return {
        async upload(path, file, options = {}) {
          const cleanPath = String(path).replace(/^\/+/, "");
          const map = fileMap();
          let old = null;
          try { old = await pb.collection(UPLOAD_COLLECTION).getFirstListItem(`path = ${JSON.stringify(cleanPath)}`); } catch {}
          if (old && options.upsert) await pb.collection(UPLOAD_COLLECTION).delete(old.id).catch(() => {});
          const record = await pb.collection(UPLOAD_COLLECTION).create({ path: cleanPath, file });
          map[cleanPath] = { id: record.id, filename: record.file };
          saveFileMap(map);
          return { data: record, error: null };
        },
        getPublicUrl(path) {
          const cleanPath = String(path).replace(/^\/+/, "");
          const entry = fileMap()[cleanPath];
          const publicUrl = entry?.id && entry?.filename
            ? `${PB_URL}/api/files/${UPLOAD_COLLECTION}/${entry.id}/${entry.filename}`
            : `${PB_URL}/api/files/${UPLOAD_COLLECTION}/missing/${encodeURIComponent(cleanPath.split("/").pop())}`;
          return { data: { publicUrl } };
        },
        async remove(paths) {
          const map = fileMap();
          for (const path of paths || []) {
            const cleanPath = String(path).replace(/^\/+/, "");
            try {
              const record = await pb.collection(UPLOAD_COLLECTION).getFirstListItem(`path = ${JSON.stringify(cleanPath)}`);
              await pb.collection(UPLOAD_COLLECTION).delete(record.id);
              delete map[cleanPath];
            } catch {}
          }
          saveFileMap(map);
          return { error: null };
        }
      };
    }
  }
};
