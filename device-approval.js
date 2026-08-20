import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const DEVICE_ID_STORAGE_KEY = "doctor_woyz_device_id";
const LOCAL_REGISTRY_STORAGE_KEY = "doctor_woyz_device_registry";
const DEVICE_COLLECTION = "deviceApprovals";

let servicesPromise = null;

export function remoteApprovalConfigured() {
  return Boolean(firebaseConfig?.apiKey && firebaseConfig?.appId && firebaseConfig?.projectId);
}

export function deviceId() {
  const saved = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (saved) return saved;
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const id = [...bytes]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .match(/.{1,4}/g)
    .join("-");
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

function localRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_REGISTRY_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalRegistry(registry) {
  localStorage.setItem(LOCAL_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
}

function localDeviceRequest() {
  const id = deviceId();
  const registry = localRegistry();
  if (!registry[id]) {
    registry[id] = {
      id,
      status: "pending",
      label: deviceLabel(),
      requestedAt: new Date().toISOString()
    };
    writeLocalRegistry(registry);
  }
  return registry[id];
}

function deviceLabel() {
  return navigator.userAgent.includes("Android") ? "Android tablet" : "Browser device";
}

async function services() {
  if (!remoteApprovalConfigured()) return null;
  if (!servicesPromise) {
    servicesPromise = Promise.resolve().then(async () => {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence);
      return { auth, db: getFirestore(app) };
    });
  }
  return servicesPromise;
}

function currentUser(auth) {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function anonymousUser(auth) {
  return await currentUser(auth) || (await signInAnonymously(auth)).user;
}

export async function ensureDeviceApprovalRequest() {
  const id = deviceId();
  const activeServices = await services();
  if (!activeServices) return { mode: "local", record: localDeviceRequest() };

  const { auth, db } = activeServices;
  const user = await anonymousUser(auth);
  const ref = doc(db, DEVICE_COLLECTION, id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      id,
      ownerUid: user.uid,
      status: "pending",
      label: deviceLabel(),
      requestedAt: serverTimestamp(),
      userAgent: navigator.userAgent
    });
    return { mode: "remote", record: { id, ownerUid: user.uid, status: "pending", label: deviceLabel() } };
  }
  return { mode: "remote", record: { id, ...snapshot.data() } };
}

export async function watchCurrentDeviceApproval(callback) {
  const id = deviceId();
  const activeServices = await services();
  if (!activeServices) {
    callback({ mode: "local", record: localDeviceRequest() });
    return () => {};
  }

  await ensureDeviceApprovalRequest();
  const ref = doc(activeServices.db, DEVICE_COLLECTION, id);
  return onSnapshot(ref, snapshot => {
    callback({ mode: "remote", record: snapshot.exists() ? { id, ...snapshot.data() } : null });
  }, error => {
    callback({ mode: "remote", error });
  });
}

export async function adminSignIn(email, password) {
  const activeServices = await services();
  if (!activeServices) throw new Error("Remote approval is not configured.");
  return signInWithEmailAndPassword(activeServices.auth, email, password);
}

export async function adminSignOut() {
  const activeServices = await services();
  if (activeServices) await signOut(activeServices.auth);
}

export async function watchAdminDevices(callback) {
  const activeServices = await services();
  if (!activeServices) {
    callback({
      mode: "local",
      devices: Object.values(localRegistry())
    });
    return () => {};
  }

  const devicesQuery = query(collection(activeServices.db, DEVICE_COLLECTION), orderBy("requestedAt", "desc"));
  return onSnapshot(devicesQuery, snapshot => {
    callback({
      mode: "remote",
      devices: snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    });
  }, error => {
    callback({ mode: "remote", error });
  });
}

export async function approveDevice(id) {
  const activeServices = await services();
  if (!activeServices) {
    const registry = localRegistry();
    const previous = registry[id] || { id, requestedAt: new Date().toISOString() };
    registry[id] = { ...previous, id, status: "approved", approvedAt: new Date().toISOString() };
    writeLocalRegistry(registry);
    return;
  }
  await updateDoc(doc(activeServices.db, DEVICE_COLLECTION, id), {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy: activeServices.auth.currentUser?.email || "admin"
  });
}

export async function revokeDevice(id) {
  const activeServices = await services();
  if (!activeServices) {
    const registry = localRegistry();
    if (registry[id]) {
      registry[id] = { ...registry[id], status: "pending", approvedAt: "" };
      writeLocalRegistry(registry);
    }
    return;
  }
  await updateDoc(doc(activeServices.db, DEVICE_COLLECTION, id), {
    status: "pending",
    approvedAt: null,
    revokedAt: serverTimestamp()
  });
}

export async function removeDevice(id) {
  const activeServices = await services();
  if (!activeServices) {
    const registry = localRegistry();
    delete registry[id];
    writeLocalRegistry(registry);
    return;
  }
  await deleteDoc(doc(activeServices.db, DEVICE_COLLECTION, id));
}
