// Los tests siempre corren como NODE_ENV=test (las variables reales del proceso ganan
// sobre los .env), y la configuracion se valida antes de cargar cualquier modulo.
process.env.NODE_ENV = "test";
await import("../src/config.js");

export {};
