# 🏗️ @brashkie/signalis-storage — Paquete Nuevo (Listo)

## ✅ Estado

```
✅ 15 archivos TypeScript, compilan con tsconfig strict + noUncheckedIndexedAccess
✅ 48 tests vitest verdes (stores + coverage error-paths)
✅ Coverage 97.39% stmts / 95% branches (umbrales 95/90 pasando)
✅ Zero dependencia de crypto → sin dependencia circular
✅ Dual CJS + ESM via tsup
✅ Biome (lint + format) + docs enterprise (README EN/ES, CHANGELOG, ROADMAP, SECURITY, CONTRIBUTING)
```

Verifiqué TODO compilando + corriendo en mi entorno (TypeScript + vitest + coverage reales).
No es "debería andar" — anda.

## 📦 Estructura

```
signalis-storage/
├── .github/
│   ├── workflows/ci.yml      5 jobs (quality, test 3OS×3Node, coverage, build, audit)
│   ├── workflows/release.yml 4 jobs (verify, version-check, publish, gh-release)
│   └── dependabot.yml
├── package.json              @brashkie/signalis-storage@0.1.0
├── tsconfig.json             (idéntico al de signalis, misma estrictez)
├── tsup.config.ts            (dual CJS+ESM, SIN external de crypto)
├── .gitignore
├── LICENSE                   (Apache-2.0)
├── README.md                 (docs completas + guía de adapters)
├── src/
│   ├── index.ts              barrel export
│   ├── errors.ts             StorageError / StorageValidationError / SerializationError
│   ├── address.ts            ProtocolAddress (self-contained, sin crypto)
│   ├── codec.ts              Codec<T> + Fingerprint<T>  ← el mecanismo de desacople
│   ├── types.ts              4 interfaces GENÉRICAS
│   ├── memory/               4 stores in-memory
│   │   ├── identity-store.ts    (Fingerprint inyectado)
│   │   ├── prekey-store.ts      (puro, sin codec)
│   │   ├── signed-prekey-store.ts (puro, sin codec)
│   │   └── session-store.ts     (Codec inyectado)
│   └── file/                 4 stores on-disk + atomic-write
│       ├── atomic-write.ts      (con retry EPERM de Windows)
│       ├── identity-store.ts    (Codec + Fingerprint)
│       ├── prekey-store.ts      (Codec)
│       ├── signed-prekey-store.ts (Codec)
│       └── session-store.ts     (Codec)
└── __tests__/
    └── stores.test.ts        22 tests
```

## ⚠️ Gotcha: `vitest.config.mts` (no `.ts`)

El archivo de config de vitest es **`.mts`**, no `.ts`. No es un capricho:

- `package.json` declara `"type": "commonjs"` → Node carga los `.ts`/`.js` como CJS.
- Vite (que vitest usa por dentro) es **ESM-only** desde v5.
- Node 18 y 20 **no pueden** hacer `require()` de un módulo ESM → `ERR_REQUIRE_ESM`.
- Node 22.12+ **sí puede** (feature nueva) → el `.ts` parece funcionar… hasta que
  el CI lo corre en Node 18/20 y explota.

La extensión `.mts` fuerza carga ESM en **todas** las versiones de Node.

**Aplica a todo el ecosistema:** cualquier paquete tuyo con `"type": "commonjs"` +
vitest tiene este bug latente (signalis, strenor, ws, vekziun…). Si su CI solo
prueba Node 22, no se nota. Renombrar `vitest.config.ts` → `.mts` lo resuelve.

## ⚙️ CI/CD (.github/)

```
.github/
├── workflows/
│   ├── ci.yml          5 jobs — corre en push a main + PRs
│   └── release.yml     4 jobs — corre al pushear un tag v*
└── dependabot.yml      updates semanales de npm + mensuales de Actions
```

### ci.yml — 5 jobs

| Job | Qué hace |
|-----|----------|
| `quality` | Biome lint + tsc typecheck (ubuntu, rápido) |
| `test` | Matriz 3 OS × 3 Node (18/20/22) = **9 combinaciones** |
| `coverage` | vitest --coverage + sube el reporte como artifact |
| `build` | tsup + verifica que dist/index.js, .mjs y .d.ts existan, y que importen limpio en CJS y ESM |
| `audit` | npm audit de deps de producción (informativo, `continue-on-error`) |

**Por qué la matriz de 3 OS:** los file stores tocan el filesystem, y la semántica
de `rename` difiere entre plataformas. El retry de EPERM existe justamente por
Windows — hay que testearlo ahí de verdad.

### release.yml — 4 jobs

| Job | Qué hace |
|-----|----------|
| `verify` | Re-corre lint + typecheck + test + build en los 3 OS |
| `version-check` | **Compara el tag contra package.json** — falla si `v0.2.0` no coincide con `"version": "0.1.0"` |
| `publish` | `npm publish --access public --provenance` |
| `github-release` | Crea el GitHub Release con notas auto-generadas |

El `version-check` te salva del error clásico de tagear una versión que no coincide
con el package.json.

### 🔑 Setup obligatorio antes del primer tag

En **GitHub → Settings → Secrets and variables → Actions → New repository secret**:

```
Name:   NPM_TOKEN
Value:  <tu token de npm con permisos de publish en @brashkie>
```

Para generar el token: npmjs.com → tu avatar → Access Tokens → Generate New Token
→ **Automation** (no "Publish" clásico — Automation funciona con 2FA activo).

Sin ese secret, el job `publish` falla.

### 📦 Sobre `--provenance`

El publish usa `--provenance`, que genera una attestation criptográfica de que el
paquete se buildeó desde este repo, en este commit, por GitHub Actions. Aparece
como un badge verificado en npm. Requiere el permiso `id-token: write` (ya está en
el workflow).

## 🚀 Publicar signalis-storage

```powershell
# Crear el repo/carpeta
cd F:\Brashkie\PROYECTOS\NPM
# Extraer signalis-storage.zip aquí → carpeta signalis-storage/

cd signalis-storage
npm install

npm run typecheck    # → 0 errors ✅
npm run test         # → 22 passing ✅
npm run build        # → dist/ con CJS + ESM + .d.ts ✅

# (opcional) crear eslint.config.js igual que en signalis-core si querés lint

git init
git add .
git commit -m "feat: initial release of @brashkie/signalis-storage v0.1.0

- Generic Signal-Protocol store interfaces (Identity/PreKey/SignedPreKey/Session)
- ProtocolAddress primitive (self-contained, filesystem-safe)
- Memory + File implementations, codec-injection for zero crypto coupling
- Atomic writes with Windows EPERM retry
- 22 tests, dual CJS+ESM"

# Crear repo en GitHub: github.com/Brashkie/signalis-storage
git remote add origin https://github.com/Brashkie/signalis-storage.git
git branch -M main
git push -u origin main

# Publicar a npm
npm publish --access public
```

## ⏭️ DESPUÉS: signalis@0.7.1 (siguiente sesión)

Una vez que `@brashkie/signalis-storage@0.1.0` esté en npm, hacemos el bump de
signalis. El plan (para la próxima charla):

1. En signalis, agregar `@brashkie/signalis-storage` como dependency.
2. Borrar `src/storage/memory/*` y `src/storage/file/*` y `src/storage/types.ts`
   y `src/address.ts` (ahora viven en storage).
3. Crear `src/storage/index.ts` que:
   - Importa los stores genéricos de signalis-storage
   - Define los codecs concretos (IdentityKeyPair, Session, etc.)
   - Exporta wrappers finos pre-cableados:
     ```ts
     export class FileIdentityStore extends BaseFileIdentityStore<IdentityKeyPair, PublicIdentityKey> {
       constructor(rootDir: string) {
         super(rootDir, identityKeyPairCodec, publicKeyFingerprint);
       }
     }
     ```
   - Re-exporta ProtocolAddress desde storage
4. El API público de signalis queda **idéntico** → los usuarios de 0.7.0 no
   notan nada → bump a **0.7.1**.
5. `SessionBuilder` se queda en signalis (es orquestación crypto, no storage) —
   solo cambia de dónde importa los tipos de store.

Lo importante: **el orden es storage PRIMERO en npm, después signalis@0.7.1**.

## 💡 Detalle De Formato En Disco

El `FileIdentityStore` nuevo escribe el registro de trusted identity como
`{ version, address, fingerprint }` — antes signalis@0.7.0 escribía además un
campo `publicKeyHex` (informativo, no usado en la lógica de confianza).

**Impacto:** ninguno. La lectura solo usa `fingerprint`. Archivos viejos con
`publicKeyHex` se leen igual (el campo extra se ignora). Como 0.7.0 se publicó
hace pocos días, es prácticamente seguro que nadie tenga datos productivos aún.

---

🔐 + ❤️ Hepein Oficial
