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
const LOCAL_AUTHORIZATION_KEY_STORAGE_KEY = "doctor_woyz_admin_authorization_key";
const DEVICE_COLLECTION = "deviceApprovals";
const CONFIG_COLLECTION = "appConfig";
const AUTHORIZATION_CONFIG_DOC = "authorization";

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

function cleanUserName(value) {
  return String(value || "").trim().slice(0, 80);
}

function localDeviceRequest(options = {}) {
  const id = deviceId();
  const registry = localRegistry();
  const userName = cleanUserName(options.userName);
  if (!registry[id]) {
    registry[id] = {
      id,
      status: "pending",
      label: deviceLabel(),
      userName,
      requestedAt: new Date().toISOString()
    };
    writeLocalRegistry(registry);
  } else if (userName && registry[id].status !== "approved") {
    registry[id] = { ...registry[id], userName };
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

export async function ensureDeviceApprovalRequest(options = {}) {
  const id = deviceId();
  const userName = cleanUserName(options.userName);
  const activeServices = await services();
  if (!activeServices) return { mode: "local", record: localDeviceRequest({ userName }) };

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
      userName,
      requestedAt: serverTimestamp(),
      userAgent: navigator.userAgent
    });
    return { mode: "remote", record: { id, ownerUid: user.uid, status: "pending", label: deviceLabel(), userName } };
  }
  const record = { id, ...snapshot.data() };
  if (userName && record.status !== "approved") {
    await updateDoc(ref, { userName });
    return { mode: "remote", record: { ...record, userName } };
  }
  return { mode: "remote", record };
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

export async function watchAdminSession(callback) {
  const activeServices = await services();
  if (!activeServices) {
    callback({ mode: "local", user: null });
    return () => {};
  }
  return onAuthStateChanged(activeServices.auth, user => {
    callback({ mode: "remote", user });
  });
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

async function authorizationKeyForApproval(activeServices) {
  if (!activeServices) {
    return localStorage.getItem(LOCAL_AUTHORIZATION_KEY_STORAGE_KEY) || "";
  }
  const snapshot = await getDoc(doc(activeServices.db, CONFIG_COLLECTION, AUTHORIZATION_CONFIG_DOC));
  return snapshot.exists() ? (snapshot.data().authorizationKey || "") : "";
}

export async function saveAuthorizationKey(value) {
  const authorizationKey = value.trim();
  if (!authorizationKey) throw new Error("Authorization key is required.");
  const activeServices = await services();
  if (!activeServices) {
    localStorage.setItem(LOCAL_AUTHORIZATION_KEY_STORAGE_KEY, authorizationKey);
    return;
  }
  await setDoc(doc(activeServices.db, CONFIG_COLLECTION, AUTHORIZATION_CONFIG_DOC), {
    authorizationKey,
    updatedAt: serverTimestamp(),
    updatedBy: activeServices.auth.currentUser?.email || "admin"
  }, { merge: true });
}

export async function authorizationKeySaved() {
  const activeServices = await services();
  if (!activeServices) {
    return Boolean(localStorage.getItem(LOCAL_AUTHORIZATION_KEY_STORAGE_KEY));
  }
  const snapshot = await getDoc(doc(activeServices.db, CONFIG_COLLECTION, AUTHORIZATION_CONFIG_DOC));
  return snapshot.exists() && Boolean(snapshot.data().authorizationKey);
}

export async function approveDevice(id) {
  const activeServices = await services();
  const authorizationKey = await authorizationKeyForApproval(activeServices);
  if (!authorizationKey) throw new Error("Save the authorization key before approving devices.");
  if (!activeServices) {
    const registry = localRegistry();
    const previous = registry[id] || { id, requestedAt: new Date().toISOString() };
    registry[id] = {
      ...previous,
      id,
      status: "approved",
      approvedAt: new Date().toISOString(),
      authorizationKey
    };
    writeLocalRegistry(registry);
    return;
  }
  await updateDoc(doc(activeServices.db, DEVICE_COLLECTION, id), {
    status: "approved",
    authorizationKey,
    authorizationKeyAssignedAt: serverTimestamp(),
    approvedAt: serverTimestamp(),
    approvedBy: activeServices.auth.currentUser?.email || "admin"
  });
}

export async function revokeDevice(id) {
  const activeServices = await services();
  if (!activeServices) {
    const registry = localRegistry();
    if (registry[id]) {
      registry[id] = { ...registry[id], status: "pending", approvedAt: "", authorizationKey: "" };
      writeLocalRegistry(registry);
    }
    return;
  }
  await updateDoc(doc(activeServices.db, DEVICE_COLLECTION, id), {
    status: "pending",
    authorizationKey: "",
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
