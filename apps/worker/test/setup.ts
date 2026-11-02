// Los tests corren como NODE_ENV=test y con la configuracion del worker validada.
process.env.NODE_ENV = "test";
await import("../src/config.js");

export {};
