# Mapa de Oferta Institucional · EPI Medellín

Aplicación web del directorio de organizaciones de **discapacidad y cuidado** en Medellín, con:

- Mapa interactivo (Leaflet) con polígonos de comunas y corregimientos.
- Filtros por categoría (Discapacidad, Cuidados, Mesas, Productos).
- Base de datos en **Supabase** (PostgreSQL) escalable.
- Autenticación con dos roles: `admin` y `consulta`.
- Panel de administración para gestionar instituciones y usuarios.
- Despliegue en **Vercel** (gratis para este uso).

---

## Estructura del proyecto

```
Mapas_oferta/
├── index.html              # Login (página de entrada)
├── mapa.html               # Mapa interactivo (requiere sesión)
├── admin.html               # Panel de administración (solo admins)
├── mapa_v2_FUENTE.html     # Archivo original (referencia, no se usa en producción)
│
├── js/
│   ├── supabase-client.js  # Cliente de Supabase compartido
│   ├── auth-guard.js       # Verifica sesión y rol antes de mostrar la página
│   ├── admin.js            # Lógica del panel de administración
│   ├── config.example.js   # Plantilla de la configuración pública
│   └── config.js           # (LO CREAS TÚ - no se sube a git)
│
├── api/
│   └── crear-usuario.js    # Función serverless para crear/borrar usuarios
│
├── data/
│   └── comunas.geojson     # (DEBES OBTENERLO - ver paso 4)
│
├── sql/
│   ├── 01-schema.sql       # Crea tablas, vistas, triggers
│   └── 02-rls-policies.sql # Permisos por rol
│
├── scripts/
│   ├── crear-admin.mjs     # Crea el primer usuario administrador
│   └── migrar-csv.mjs      # Importa los CSVs originales a Supabase
│
├── package.json
├── vercel.json
├── .env.example            # Plantilla de variables de entorno
├── .env.local              # (LO CREAS TÚ - no se sube a git)
└── .gitignore
```

---

## Pasos de instalación (orden importa)

### 1. Instalar Node.js (si no lo tienes)

Descarga la versión LTS desde https://nodejs.org/ e instálala.

Verifica que quedó bien:

```powershell
node --version
npm --version
```

### 2. Instalar dependencias del proyecto

Desde PowerShell, dentro de la carpeta `Mapas_oferta`:

```powershell
npm install
```

### 3. Configurar las variables de entorno

#### a) Obtener las llaves de Supabase

1. Entra a tu [Supabase Dashboard](https://app.supabase.com).
2. Selecciona tu proyecto.
3. Ve a **Project Settings** → **API**.
4. Copia tres valores:
   - `Project URL` (ej: `https://abcde12345.supabase.co`)
   - `anon public` key (segura para el navegador)
   - `service_role` key (SECRETA, solo para servidor)

#### b) Crear `.env.local`

Copia `.env.example` como `.env.local` y completa con los valores reales:

```powershell
copy .env.example .env.local
notepad .env.local
```

Llena especialmente:

```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_EMAIL=tucorreo@epi.gov.co
ADMIN_PASSWORD=una_contrasena_segura
ADMIN_NOMBRE=Diana Administradora
```

#### c) Crear `js/config.js`

Copia `js/config.example.js` como `js/config.js` y pon SOLO la URL y la `anon key`:

```powershell
copy js\config.example.js js\config.js
notepad js\config.js
```

```js
export const SUPABASE_URL      = 'https://tu-proyecto.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...'; // la anon, NO la service_role
```

### 4. Obtener el archivo `data/comunas.geojson`

Necesitas el GeoJSON con los polígonos de las **comunas y corregimientos de Medellín**.

Cada feature debe tener estas propiedades:

```json
{
  "nombre": "10 - LA CANDELARIA",
  "nombre_corto": "Candelaria",
  "numero": 10,
  "tipo": "comuna",  // o "corregimiento"
  "org_key": "10 - LA CANDELARIA",
  "clat": 6.247,
  "clon": -75.567
}
```

**Dónde obtenerlo:**

- Portal de datos abiertos de Medellín: [GeoMedellín](https://geomedellin-m-medellin.opendata.arcgis.com/)
- O pídele a quien generó el `mapa_v2_FUENTE.html` el archivo original que iba en `DATA_PLACEHOLDER`.

Luego guárdalo como `data/comunas.geojson`.

### 5. Crear las tablas en Supabase

1. En tu Supabase Dashboard, ve a **SQL Editor** → **New query**.
2. Abre el archivo `sql/01-schema.sql`, copia TODO su contenido, pégalo en el editor y presiona **RUN**.
3. Repite con `sql/02-rls-policies.sql`.

Verifica que se crearon las tablas en **Table Editor**:
- `perfiles`
- `instituciones`
- `productos_apoyo`

### 6. Crear el primer usuario administrador

```powershell
npm run crear-admin
```

Esto usa los valores `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` de tu `.env.local`.

### 7. Migrar los datos existentes (CSVs)

```powershell
npm run migrar
```

Esto leerá los CSVs de `INFORMACIONN PARA DESARROLLO WEB\Archivos csv\` y los insertará en la base de datos.

### 8. Probar localmente con Vercel

```powershell
npm install -g vercel
vercel login
vercel dev
```

Esto levanta un servidor local en http://localhost:3000 que simula Vercel (incluye las funciones serverless de `/api/`).

Abre [http://localhost:3000](http://localhost:3000), inicia sesión con tus credenciales de admin, y prueba todo.

### 9. Desplegar en Vercel (producción)

#### a) Subir el código a GitHub

```powershell
git init
git add .
git commit -m "Versión inicial del mapa con Supabase"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mapa-oferta-epi.git
git push -u origin main
```

#### b) Conectar Vercel al repo

1. Ve a https://vercel.com/new
2. Importa tu repositorio de GitHub.
3. En **Environment Variables**, agrega TRES (no subas `.env.local` al repo):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Click en **Deploy**.

En 1-2 minutos tendrás tu sitio en `https://tu-proyecto.vercel.app`.

> **Importante:** Para que el navegador pueda leer la configuración de Supabase, también necesitas que `js/config.js` exista en producción. Tienes dos opciones:
>
> 1. **Más fácil:** committear `js/config.js` al repo (la `anon key` es PÚBLICA por diseño y SÍ se puede exponer; el RLS la protege). Quita `js/config.js` del `.gitignore`.
>
> 2. **Más limpio:** crear un build step que genere `js/config.js` en cada deploy desde las variables de entorno.

Para empezar, recomiendo la opción 1.

---

## Cómo usar el sistema

### Como administrador

1. Abrir la URL → entras a la pantalla de login.
2. Iniciar sesión con tu correo/contraseña.
3. Te redirige a `/admin.html`.
4. Tres pestañas:
   - **🏛 Instituciones** — crear/editar/borrar organizaciones que aparecen en el mapa.
   - **🦽 Productos** — gestionar el catálogo de ayudas técnicas.
   - **👥 Usuarios** — crear nuevos usuarios (consulta o admin), activarlos/desactivarlos, borrarlos.
5. Botón **🗺 Ver mapa** en la cabecera para ver cómo se ven los datos en el mapa público.

### Como usuario de consulta

1. Iniciar sesión.
2. Te redirige directo a `/mapa.html`.
3. Puedes navegar todo el mapa, filtrar, ver fichas de organizaciones, etc.
4. **No puedes** crear/editar nada ni acceder al panel de admin.

---

## Seguridad: cómo está protegido

1. **Sin sesión = no entras.** El mapa, el admin y todas las páginas requieren login.
2. **Row Level Security (RLS) en Supabase.** Aunque alguien intente llamar la API directamente con la `anon key`, las políticas SQL le impiden ver/escribir nada sin autenticarse.
3. **Service role key NUNCA en el navegador.** Solo se usa en `api/crear-usuario.js` (corre en servidor) y en los scripts locales.
4. **Roles validados en backend.** La función serverless verifica que quien crea/borra usuarios sea efectivamente un admin antes de actuar.

---

## Mantenimiento

### Agregar campos a la tabla

1. Edita `sql/01-schema.sql` y agrega la columna en `instituciones`.
2. Ejecuta el SQL en Supabase.
3. Agrega el campo correspondiente en `admin.html` (formulario) y `js/admin.js` (lectura/escritura).

### Cambiar el rol de un usuario rápido

Sin abrir el panel: en Supabase Dashboard → **Table Editor** → tabla `perfiles`, editas la fila directamente.

### Backups

Supabase hace backups diarios automáticos. Adicionalmente puedes exportar a CSV en cualquier momento desde **Table Editor** → **Export**.

---

## Costos

- **Supabase Free tier:** 500 MB de base de datos, 2 GB de transferencia, 50,000 usuarios autenticados al mes. Más que suficiente para este proyecto.
- **Vercel Hobby:** 100 GB de ancho de banda al mes, despliegues ilimitados. Gratis.

Si algún día crecen los datos a más de 500 MB, Supabase Pro cuesta USD 25/mes.

---

## Soporte

Si algo falla, revisa los logs:

- **Supabase:** Dashboard → Logs → Postgres / Auth.
- **Vercel:** Dashboard del proyecto → Deployments → Functions / Runtime Logs.
- **Navegador:** F12 → Console.
