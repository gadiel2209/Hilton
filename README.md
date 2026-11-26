# Frontend · HGI Operaciones (GitHub Pages)

Esta carpeta contiene únicamente la interfaz web (`index.html`, `login.html`, `css/` y `js/`) que manda a traer las APIs desplegadas en **Vercel**.

## Archivos donde se consumen las APIs

- `js/config-api.js`: Aquí colocas la URL base de tu proyecto en Vercel (`export const API_BASE_URL = 'https://tu-api.vercel.app';`).
- `js/comun.js`: Contiene la función `api(ruta, opciones)` que realiza las peticiones `fetch()` hacia `${API_BASE_URL}/api/...` adjuntando el token de sesión (`Authorization: Bearer <token>`).
- `js/login.js`: Envía `POST /api/auth/login`, guarda el token recibido en `sessionStorage` y redirige a `index.html`.
- `js/panel.js`: Consulta `GET /api/auth/me`, `GET /api/dashboard` y `POST /api/auth/logout`.
- `js/habitaciones.js` (página `habitaciones.html`): Busca con `GET /api/habitaciones?q=`, agrega con `POST /api/habitaciones`, elimina con `DELETE /api/habitaciones?numero=&version=`, edita datos con `PATCH /api/habitaciones`, consulta `GET /api/habitaciones/historial`, cambia el estado con `PATCH /api/habitaciones/estado` y vuelve a consultar la base para verificar que el cambio quedó guardado. Estilos en `css/habitaciones.css`.

## Cómo subirlo a GitHub Pages

1. Sube el contenido de esta carpeta (`index.html`, `login.html`, `css/`, `js/`) a tu repositorio de GitHub Pages.
2. En `js/config-api.js`, escribe la URL pública que te dio Vercel.
3. Activa **Settings > Pages** en la rama `main` (`/ (root)`).
