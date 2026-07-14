<div align="center">

# @brashkie/signalis-storage

**La capa de almacenamiento desacoplada para la implementación del Protocolo Signal [Signalis](https://github.com/Brashkie/signalis).**

[![CI](https://github.com/Brashkie/signalis-storage/actions/workflows/ci.yml/badge.svg)](https://github.com/Brashkie/signalis-storage/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@brashkie/signalis-storage.svg)](https://www.npmjs.com/package/@brashkie/signalis-storage)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](#tests--cobertura)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](https://nodejs.org/)

[English](./README.md) · [Español](./README.es.md)

</div>

---

Interfaces canónicas de almacenamiento del Protocolo Signal (`IdentityStore`, `PreKeyStore`, `SignedPreKeyStore`, `SessionStore`), la primitiva `ProtocolAddress`, helpers de escritura atómica, y dos implementaciones listas para producción — **en memoria** y **en disco** — todas **genéricas** sobre los tipos de objetos criptográficos y cableadas mediante codecs inyectados.

Este paquete tiene **cero dependencia del núcleo criptográfico.** Las clases criptográficas (`IdentityKeyPair`, `Session`, etc.) las provee el consumidor mediante pequeños objetos codec. El resultado es un grafo de dependencias acíclico y una capa de almacenamiento que podés testear, versionar y reutilizar de forma independiente del protocolo.

```
  @brashkie/signalis  ──depende de──▶  @brashkie/signalis-storage
        │                                       ▲
        └── inyecta codecs ─────────────────────┘   (sin import inverso)
```

---

## Tabla de Contenidos

- [¿Para quién es esto?](#para-quién-es-esto)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Arquitectura: ¿por qué codecs?](#arquitectura-por-qué-codecs)
- [Referencia de API](#referencia-de-api)
- [Escribir un adapter propio](#escribir-un-adapter-propio)
- [Layout en disco](#layout-en-disco)
- [Durabilidad y escrituras atómicas](#durabilidad-y-escrituras-atómicas)
- [Consideraciones de seguridad](#consideraciones-de-seguridad)
- [Tests y cobertura](#tests--cobertura)
- [Ecosistema](#ecosistema)
- [Versionado y estabilidad](#versionado-y-estabilidad)
- [Licencia](#licencia)

---

## ¿Para quién es esto?

**La mayoría no debería instalar este paquete directamente.** `@brashkie/signalis` re-exporta versiones pre-cableadas de cada store, así que el código de aplicación obtiene `new FileIdentityStore(dir)` sin codecs de por medio.

Instalá `@brashkie/signalis-storage` directamente si estás:

- **Construyendo un adapter de almacenamiento propio** — SQLite, Redis, IndexedDB, Postgres, Strenor, o cualquier otro backend.
- **Escribiendo herramientas** que inspeccionan o migran el estado en disco de Signalis.
- **Auditando** la capa de almacenamiento aislada del núcleo criptográfico.

---

## Instalación

```bash
npm install @brashkie/signalis-storage
# o
pnpm add @brashkie/signalis-storage
# o
yarn add @brashkie/signalis-storage
```

Se distribuye como **CommonJS + ESM** dual con declaraciones TypeScript completas. Node.js **≥ 18**.

---

## Inicio rápido

Usando el file store para construir un adapter propio (el codec criptográfico es lo
que `@brashkie/signalis` normalmente te provee):

```ts
import {
  FileSessionStore,
  ProtocolAddress,
  type Codec,
} from '@brashkie/signalis-storage';

// Un codec conecta tu objeto criptográfico <-> un snapshot JSON-friendly.
const sessionCodec: Codec<MySession> = {
  serialize: (s) => s.serialize(),
  deserialize: (snap) => MySession.deserialize(snap),
};

const store = new FileSessionStore('/var/lib/myapp/signal', sessionCodec);

await store.saveSession(new ProtocolAddress('alice@example.com', 1), session);
const restored = await store.loadSession(new ProtocolAddress('alice@example.com', 1));
```

---

## Arquitectura: ¿por qué codecs?

Las implementaciones de stores deben serializar objetos criptográficos a
almacenamiento durable y reconstruirlos después — ej. `IdentityKeyPair.deserialize(bytes)`.
Esas clases viven en `@brashkie/signalis`. Si storage las importara directamente
mientras `signalis` importa storage, el resultado sería una **dependencia circular**.

La solución: storage nunca nombra una clase criptográfica. Cada store que necesita
serialización recibe un **codec**, y cada store que necesita comparar claves
públicas recibe un **fingerprint**:

```ts
interface Codec<T> {
  serialize(value: T): unknown;      // → un snapshot JSON-serializable
  deserialize(snapshot: unknown): T; // ← reconstruye el objeto
}

interface Fingerprint<T> {
  fingerprint(value: T): string;     // un string estable y comparable
}
```

`@brashkie/signalis` provee los codecs concretos una sola vez, envuelve los stores
genéricos en subclases finas, y los re-exporta. Los autores de aplicaciones nunca
ven esta maquinaria — instancian `new FileIdentityStore(dir)` y simplemente funciona.

**Consecuencias del diseño:**

| Propiedad | Beneficio |
|-----------|-----------|
| Cero import criptográfico | Grafo de dependencias acíclico; storage compila y testea solo |
| Genérico sobre `T` | Una implementación sirve para cada forma criptográfica |
| Codec en el límite | Cifrado en reposo, compresión o cambios de formato quedan localizados |
| Las interfaces son el contrato | Cualquier backend (SQL, KV, cloud) es drop-in |

---

## Referencia de API

### Address

| Export | Descripción |
|--------|-------------|
| `ProtocolAddress` | Identificador de par `(userId, deviceId)`; seguro para filesystem, inmutable |
| `isProtocolAddress(v)` | Type guard |
| `MAX_DEVICE_ID`, `MAX_USER_ID_LENGTH` | Límites de validación |

```ts
const addr = new ProtocolAddress('alice@example.com', 1);
addr.toString();          // "alice@example.com.1"
ProtocolAddress.parse('alice@example.com.1'); // round-trip
addr.equals(other);       // igualdad estructural
```

### Interfaces de stores (genéricas)

| Interface | Type params | Responsabilidad |
|-----------|-------------|-----------------|
| `IdentityStore<KP, PK>` | key pair, clave pública | identidad propia + registration id + fingerprints de pares confiables (TOFU) |
| `PreKeyStore<OPK>` | one-time prekey | prekeys de un solo uso (borrar-tras-usar) |
| `SignedPreKeyStore<SPK>` | signed prekey | signed prekeys + puntero activo |
| `SessionStore<S>` | session | estado del Double Ratchet por par |

### Contratos de codec

| Export | Descripción |
|--------|-------------|
| `Codec<T>` | round-trip `serialize` / `deserialize` |
| `Fingerprint<T>` | string estable de una vía para comparación |

### Implementaciones incluidas

| Clase | Backend | Necesita |
|-------|---------|----------|
| `MemoryIdentityStore<KP, PK>` | Map en proceso | `Fingerprint<PK>` |
| `MemoryPreKeyStore<OPK>` | Map en proceso | — |
| `MemorySignedPreKeyStore<SPK>` | Map en proceso | — |
| `MemorySessionStore<S>` | Map en proceso | `Codec<S>` |
| `FileIdentityStore<KP, PK>` | JSON en disco | `Codec<KP>` + `Fingerprint<PK>` |
| `FilePreKeyStore<OPK>` | JSON en disco | `Codec<OPK>` |
| `FileSignedPreKeyStore<SPK>` | JSON en disco | `Codec<SPK>` |
| `FileSessionStore<S>` | JSON en disco | `Codec<S>` |

### Helpers de archivos

`atomicWriteFile`, `readFileOrNull`, `unlinkIfExists`, `listFiles` — expuestos para
autores de adapters basados en archivos.

### Errores

`StorageError` (base) · `StorageValidationError` · `SerializationError`. Todos llevan
un bag `context` estructurado opcional.

---

## Escribir un adapter propio

Implementá la interface que necesites. Todo es genérico sobre tus tipos criptográficos,
así que tu adapter nunca hardcodea una clase criptográfica:

```ts
import type { SessionStore, Codec } from '@brashkie/signalis-storage';
import { ProtocolAddress } from '@brashkie/signalis-storage';

export class RedisSessionStore<S> implements SessionStore<S> {
  constructor(
    private readonly redis: RedisClient,
    private readonly codec: Codec<S>,
  ) {}

  async saveSession(address: ProtocolAddress, session: S): Promise<void> {
    const snapshot = this.codec.serialize(session);
    await this.redis.set(`sess:${address.toString()}`, JSON.stringify(snapshot));
  }

  async loadSession(address: ProtocolAddress): Promise<S | null> {
    const raw = await this.redis.get(`sess:${address.toString()}`);
    return raw === null ? null : this.codec.deserialize(JSON.parse(raw));
  }

  async containsSession(address: ProtocolAddress): Promise<boolean> {
    return (await this.redis.exists(`sess:${address.toString()}`)) === 1;
  }

  async deleteSession(address: ProtocolAddress): Promise<void> {
    await this.redis.del(`sess:${address.toString()}`);
  }

  async loadAllSessions(): Promise<Array<{ address: ProtocolAddress; session: S }>> {
    const keys = await this.redis.keys('sess:*');
    const out: Array<{ address: ProtocolAddress; session: S }> = [];
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (raw === null) continue;
      out.push({
        address: ProtocolAddress.parse(key.slice('sess:'.length)),
        session: this.codec.deserialize(JSON.parse(raw)),
      });
    }
    return out;
  }
}
```

El consumidor (normalmente `@brashkie/signalis`) cablea el codec concreto:

```ts
import { Session } from '@brashkie/signalis';

const sessionCodec = {
  serialize: (s: Session) => s.serialize(),
  deserialize: (snap: unknown) => Session.deserialize(snap as never),
};

const store = new RedisSessionStore(redis, sessionCodec);
```

---

## Layout en disco

Los stores `File*` usan un layout JSON predecible e inspeccionable:

```
<rootDir>/
├── identity.json              # keypair propio — sensible (chmod 600)
├── registration-id.json
├── trusted/
│   └── <address>.json         # un archivo por par (fingerprints TOFU)
├── prekeys/
│   └── <id>.json
├── signed-prekeys/
│   ├── <id>.json
│   └── active.json            # puntero al signed prekey activo
└── sessions/
    └── <address>.json         # estado del ratchet por par — sensible
```

Cada registro es un documento JSON versionado (`{ version, ... }`) para que futuras
migraciones de formato sean detectables.

---

## Durabilidad y escrituras atómicas

El material de claves de Signal nunca debe quedar a medio escribir tras un crash.
Cada escritura pasa por `atomicWriteFile`, que ejecuta:

1. Escribir a `<path>.tmp.<random>`
2. `fsync()` para vaciar los buffers del kernel al dispositivo físico
3. `rename()` al path final (atómico en el mismo filesystem)

En cualquier instante, el archivo en disco es o el valor viejo completo o el valor
nuevo completo — nunca una escritura parcial.

**Resiliencia en Windows.** En Windows, el `rename()` final puede fallar
transitoriamente con `EPERM` / `EBUSY` / `EACCES` cuando el antivirus, el indexador
de búsqueda u otro handle sostiene el destino brevemente. `atomicWriteFile` reintenta
hasta cinco veces con backoff exponencial (1 → 16 ms) antes de propagar el error — el
mismo patrón de robustez que usan `esbuild`, `sharp` y otros paquetes nativos maduros.

---

## Consideraciones de seguridad

- **Los archivos de sesión e identidad contienen material de claves sensible.** Se
  recomienda fuertemente el cifrado en reposo en producción. Como el codec está en el
  límite de serialización, podés envolverlo para cifrar/descifrar de forma
  transparente, o desplegar los file stores sobre un filesystem cifrado / enclave seguro.
- **Los one-time prekeys son de un solo uso.** DEBEN borrarse tras un handshake
  exitoso (`removePreKey`) — reusarlos rompe la forward secrecy. El `SessionBuilder` de
  `@brashkie/signalis` lo garantiza.
- **`ProtocolAddress` está endurecido para filesystem.** Los valores de `userId` con
  separadores de path, caracteres de control o meta-caracteres de shell se rechazan en
  la construcción, previniendo path traversal en los file stores.
- **Sin secretos en logs.** Los bags `context` de errores nunca incluyen material de
  claves — solo ids y direcciones.

Reportá vulnerabilidades según [SECURITY.md](./SECURITY.md).

---

## Tests y cobertura

```bash
npm test            # correr la suite
npm run test:coverage
```

La suite ejercita cada store (memory + file), el límite de inyección de codecs, la
validación de `ProtocolAddress`, los error-paths de escritura atómica (incluyendo
reintentos simulados de `EPERM` en Windows) y la jerarquía de errores.

| Métrica | Cobertura |
|---------|-----------|
| Statements | 100% |
| Branches | ~98% |
| Functions | 100% |

Las pocas líneas sin cubrir son dead-code defensivo (bloques `catch` anidados de
limpieza) que no se pueden disparar sin corromper el sandbox de tests.

---

## Ecosistema

| Paquete | Rol |
|---------|-----|
| [`@brashkie/signalis`](https://github.com/Brashkie/signalis) | El protocolo: X3DH, Double Ratchet, Sender Keys, sesiones |
| [`@brashkie/signalis-core`](https://github.com/Brashkie/signalis-core) | Primitivas criptográficas nativas en Rust (Curve25519, HKDF, AEAD…) |
| **`@brashkie/signalis-storage`** | **Este paquete — el contrato de storage + impls Memory/File** |
| `@brashkie/signalis-storage-strenor` *(planeado)* | Adapter sobre [Strenor](https://github.com/Brashkie/strenor), un motor KV embebido |
| `@brashkie/signalis-storage-sqlite` *(bajo demanda)* | Adapter sobre `better-sqlite3` |
| `@brashkie/signalis-storage-redis` *(bajo demanda)* | Adapter sobre el cliente de Redis |

Ver [ROADMAP.md](./ROADMAP.md) para el roadmap de storage.

---

## Versionado y estabilidad

Versionado Semántico. Antes de 1.0, las versiones minor pueden incluir refinamientos
de interfaces — fijá un rango caret (`^0.x`) y leé el [CHANGELOG](./CHANGELOG.md)
antes de actualizar. Las interfaces de stores son la superficie de estabilidad; las
implementaciones incluidas pueden ganar diagnósticos sin un bump que rompa.

---

## Licencia

Apache-2.0 © Brashkie (Hepein Oficial)
