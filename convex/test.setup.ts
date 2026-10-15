/// <reference types="vite/client" />
// The function modules convex-test loads; shared by every test file.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
