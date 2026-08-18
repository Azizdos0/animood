import "@testing-library/jest-dom/vitest";

// Polyfill localStorage if needed (jsdom sometimes doesn't provide it properly)
if (typeof window !== "undefined") {
  const storage: Record<string, string> = {};

  const storageImpl = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
    clear: () => {
      Object.keys(storage).forEach(key => {
        delete storage[key];
      });
    },
    key: (index: number) => Object.keys(storage)[index] ?? null,
    get length() {
      return Object.keys(storage).length;
    },
  } as any;

  // Replace or patch localStorage
  if (!window.localStorage || typeof window.localStorage.getItem !== "function") {
    window.localStorage = storageImpl;
  }
}
