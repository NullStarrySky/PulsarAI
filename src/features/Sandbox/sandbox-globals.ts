export const sandboxGlobalGroups = {
  network: [
    "fetch",
    "WebSocket",
    "EventSource",
    "XMLHttpRequest",
    "Image",
    "Audio",
  ],
  storage: [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
  ],
  page: [
    "document",
    "location",
    "navigator",
    "history",
    "open",
    "parent",
    "top",
    "opener",
    "frames",
  ],
  workers: [
    "Worker",
    "SharedWorker",
    "BroadcastChannel",
    "MessageChannel",
    "MessagePort",
  ],
  codeGeneration: [
    "eval",
    "Function",
  ],
} as const;

export type SandboxGlobalGroup = keyof typeof sandboxGlobalGroups;

const allControlledGlobalNames = [
  ...new Set(Object.values(sandboxGlobalGroups).flat()),
];
const controlledGlobalNames = new Set<string>(allControlledGlobalNames);
const globalFacadeNames = new Set(["globalThis", "window", "self"]);
const globalThisBoundFunctionNames = new Set([
  "fetch",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "queueMicrotask",
  "getComputedStyle",
  "matchMedia",
  "alert",
  "confirm",
  "prompt",
  "open",
  "close",
  "print",
  "atob",
  "btoa",
]);

function permissionError(name: string, operation: string) {
  return new Error(
    `Sandbox 未授权全局对象 "${name}"，已拦截${operation}。请在权限设置的“全局对象”中显式授权。`,
  );
}

function createDeniedGlobal(name: string): unknown {
  const fail = (operation: string): never => {
    throw permissionError(name, operation);
  };
  const placeholder = function deniedSandboxGlobal() {
    return fail("调用");
  };
  return new Proxy(placeholder, {
    get: (_target, property) => {
      if (property === Symbol.toStringTag) {
        return "DeniedSandboxGlobal";
      }
      return fail(`读取属性 ${String(property)}`);
    },
    set: (_target, property) => fail(`写入属性 ${String(property)}`),
    defineProperty: (_target, property) => fail(`定义属性 ${String(property)}`),
    deleteProperty: (_target, property) => fail(`删除属性 ${String(property)}`),
    apply: () => fail("调用"),
    construct: () => fail("构造"),
  });
}

const nativeGlobalCache = new Map<string, unknown>();

function readNativeGlobal(name: string) {
  if (!nativeGlobalCache.has(name)) {
    const value = Reflect.get(globalThis, name);
    nativeGlobalCache.set(
      name,
      typeof value === "function" && globalThisBoundFunctionNames.has(name)
        ? value.bind(globalThis)
        : value,
    );
  }
  return nativeGlobalCache.get(name);
}

export function createSandboxGlobalApi(
  grantedGroups?: Iterable<string>,
): Record<string, unknown> {
  const grantedNames = new Set<string>();
  if (grantedGroups === undefined) {
    for (const names of Object.values(sandboxGlobalGroups)) {
      for (const name of names) grantedNames.add(name);
    }
  } else {
    for (const group of grantedGroups) {
      if (group in sandboxGlobalGroups) {
        for (const name of sandboxGlobalGroups[group as SandboxGlobalGroup]) {
          grantedNames.add(name);
        }
      }
    }
  }
  const target = Object.fromEntries(
    allControlledGlobalNames.map((name) => [name, undefined]),
  );
  return new Proxy(target, {
    get: (_target, property) => {
      if (property === Symbol.toStringTag) {
        return "SandboxGlobalApi";
      }
      if (typeof property !== "string" || !controlledGlobalNames.has(property)) {
        return undefined;
      }
      return grantedNames.has(property)
        ? readNativeGlobal(property)
        : createDeniedGlobal(property);
    },
    set: (_target, property) => {
      throw permissionError(String(property), "替换全局对象");
    },
  });
}

export function createSandboxScope(
  environment: Record<string | number, unknown>,
): Record<string | number, unknown> {
  const globalApi = environment.globals && typeof environment.globals === "object"
    ? environment.globals as Record<string, unknown>
    : createSandboxGlobalApi([]);
  let globalFacade: Record<string, unknown>;

  globalFacade = new Proxy(Object.create(null) as Record<string, unknown>, {
    has: () => true,
    get: (_target, property) => {
      if (property === Symbol.unscopables) {
        return undefined;
      }
      if (property === Symbol.toStringTag) {
        return "SandboxGlobal";
      }
      if (typeof property !== "string") {
        return undefined;
      }
      if (globalFacadeNames.has(property)) {
        return globalFacade;
      }
      if (controlledGlobalNames.has(property)) {
        return globalApi[property];
      }
      if (property in globalThis) {
        return readNativeGlobal(property);
      }
      return createDeniedGlobal(property);
    },
    set: (_target, property) => {
      throw permissionError(String(property), "写入全局作用域");
    },
    defineProperty: (_target, property) => {
      throw permissionError(String(property), "定义全局属性");
    },
    deleteProperty: (_target, property) => {
      throw permissionError(String(property), "删除全局属性");
    },
  });

  return new Proxy(environment, {
    has: (_target, property) => property !== Symbol.unscopables,
    get: (target, property, receiver) => {
      if (property === Symbol.unscopables) {
        return undefined;
      }
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (typeof property !== "string") {
        return undefined;
      }
      if (globalFacadeNames.has(property)) {
        return globalFacade;
      }
      if (controlledGlobalNames.has(property)) {
        return globalApi[property];
      }
      if (property in globalThis) {
        return readNativeGlobal(property);
      }
      return createDeniedGlobal(property);
    },
    set: (target, property, value, receiver) => {
      if (Reflect.has(target, property)) {
        return Reflect.set(target, property, value, receiver);
      }
      throw permissionError(String(property), "写入未声明变量");
    },
  });
}
