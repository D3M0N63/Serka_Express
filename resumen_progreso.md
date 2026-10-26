# Resumen de progreso

## 2026-10-26 — Rediseño UI (etapas 1–4, 6, 7 parcial)
**Hecho**
- Auditoría: app vanilla HTML/JS/CSS (17 pantallas) sobre Netlify Functions + Neon; sin framework ni build.
- Nueva shell inyectada por JS (sidebar / tab bar móvil) en 14 pantallas autenticadas; eliminado el header+subnav duplicado.
- `css/style.css` reescrito como sistema de diseño (ver `REDISENO_UI.md`); bloque de impresión conservado.
- Rediseñados: login, rastreo público, inicio, y estilos globales de todas las pantallas (envíos, detalle, nuevo envío, planilla, clientes, pagar, crédito, caja, cierres, usuarios, perfil, formularios).
- Archivos: `frontend/css/style.css`, `frontend/js/api.js`, `frontend/index.html`, `frontend/track.html`, `frontend/new-shipment.html`, `<body data-nav>` en las demás.

**Verificado (servidor mock local, sin tocar la BD real)**
- Login, inicio (desktop 1365px), inicio/nuevo envío/detalle en 390px: sin solapamientos visibles.

**Revisión de las 8 pantallas restantes (mock local)**
- Desktop 1366px: planilla, crédito, caja, cierres, usuarios, clientes, pagar, perfil renderizan bien. Correcciones: `.btn` base sin fondo (botón "Crear Planilla"), `.grid-2` estirado, franja de métricas con 5 ítems (auto-fit), etiqueta perdida en la última columna móvil (Crédito).
- Móvil 320px (planilla, crédito, caja, cierres): sin desbordes.
- Los textos "undefined"/error en Caja y Cierres vienen de datos del mock con forma distinta a la real, no del CSS.

**Pendiente / no verificado**
- Clientes, pagar, usuarios y perfil en móvil; modales de caja/crédito abiertos.
- Impresión de ticket/etiqueta/planilla no probada tras el cambio de selectores.
- Tablet (768–1024) y 320px sin revisar; sin pruebas automatizadas en el repo.
- Cambios previos sin commitear del usuario siguen en el working tree; nada se commiteó.
