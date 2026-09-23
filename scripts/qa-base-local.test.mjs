import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseUrlDeEnv, motivoParaNoCorrer } from "./qa-base-local.mjs";

const LOCAL = "http://127.0.0.1:8080";

describe("motivoParaNoCorrer", () => {
  it("corre contra el servidor local sin DATABASE_URL", () => {
    assert.equal(motivoParaNoCorrer({ databaseUrl: undefined, envLocal: "IMAN_ESTUDIO_PASSWORD=x\n", baseUrl: LOCAL }), null);
    assert.equal(motivoParaNoCorrer({ databaseUrl: "  ", envLocal: "", baseUrl: "http://localhost:8080/" }), null);
  });

  it("no corre con DATABASE_URL en el entorno", () => {
    assert.match(motivoParaNoCorrer({ databaseUrl: "postgres://neon/iman", envLocal: "", baseUrl: LOCAL }), /DATABASE_URL/);
  });

  it("no corre con DATABASE_URL en .env.local, que dev:local le pasa al servidor", () => {
    const envLocal = "# comentario\nIMAN_ESTUDIO_PASSWORD=x\nexport DATABASE_URL='postgres://neon/iman'\n";
    assert.match(motivoParaNoCorrer({ databaseUrl: "", envLocal, baseUrl: LOCAL }), /\.env\.local/);
  });

  it("no corre contra un servidor que no es esta máquina", () => {
    assert.match(motivoParaNoCorrer({ databaseUrl: "", envLocal: "", baseUrl: "https://iman.app" }), /no es esta máquina/);
    assert.match(motivoParaNoCorrer({ databaseUrl: "", envLocal: "", baseUrl: "http://192.168.0.10:8080" }), /no es esta máquina/);
  });
});

describe("databaseUrlDeEnv", () => {
  it("ignora comentarios y otras claves", () => {
    assert.equal(databaseUrlDeEnv("# DATABASE_URL=postgres://x\nOTRA=1\n"), "");
    assert.equal(databaseUrlDeEnv("DATABASE_URL=\n"), "");
    assert.equal(databaseUrlDeEnv('DATABASE_URL="postgres://x"'), "postgres://x");
  });
});
