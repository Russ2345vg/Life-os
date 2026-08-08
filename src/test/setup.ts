import 'fake-indexeddb/auto';

const runtimeGlobal = globalThis as typeof globalThis & {
  readonly process?: { readonly env: Record<string, string | undefined> };
};

if (runtimeGlobal.process !== undefined) {
  runtimeGlobal.process.env.TZ = 'Asia/Tokyo';
}
