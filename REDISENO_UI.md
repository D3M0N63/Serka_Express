# Rediseño UI — Serka Express

## Diagnóstico del diseño anterior
- Barra amarilla con degradado + subnav horizontal de 9 enlaces duplicada a mano en 15 HTML; en móvil el subnav hacía scroll horizontal oculto.
- Todo era "tarjeta blanca con sombra"; las 4 métricas eran 4 tarjetas idénticas.
- Tablas con encabezado en mayúsculas pesadas y, en móvil, una fila apilada de etiqueta/valor por campo (fichas muy largas).
- Login: tarjeta centrada sobre degradado amarillo.

## Dirección nueva
Sidebar oscura (tinta) con indicador amarillo, superficies planas con filete, números tabulares, acento amarillo usado con parquedad (indicador activo, CTA, marca de títulos de panel).

## Paleta preservada
`--brand #ffde02`, `--brand-deep #e8c400`, `--ink #141414`, `--bg #f6f5f1`, `--border #e3e1d6`, `--green #1d9a5b`, `--amber #c9861a`, `--purple #6a2fc9`, `--red #c62f3a`. Solo se añadieron derivados (tonos suaves de estado, `--surface-2`).

## Tipografía
Pila del sistema (`ui-sans-serif, system-ui, …`), sin dependencias nuevas; `font-variant-numeric: tabular-nums` global. Títulos 24/800, micro-etiquetas 11–12px uppercase con tracking.

## Arquitectura
- `js/api.js` → `initTopbar()` construye la shell (sidebar, barra móvil, tab bar, hoja "Más") una sola vez desde la lista `NAV`, filtrada por rol (misma lógica de visibilidad que antes). Cada HTML solo declara `<body data-nav="página.html">` para marcar la sección activa.
- `css/style.css`: tokens · base · shell · página · botones · paneles · formularios · avisos · listados/tabla · modal · login · impresión. Las clases que usan los JS (`btn`, `card`, `badge-*`, `info-row`, `stat-card`, `shipments`…) se mantienen; el CSS de tickets/etiquetas/planilla/crédito se conserva intacto salvo selectores de ocultar la shell al imprimir.

## Responsive
- ≥960px: sidebar fija de 248px.
- <960px: barra superior + tab bar inferior (Inicio, Envíos, Planilla, Caja, Más) y hoja inferior con el resto/perfil/salir.
- Tablas <700px: fichas de 2 columnas compactas (ruta y acciones a ancho completo).
- Modales <600px: hoja inferior. Acciones de formulario fijas sobre la tab bar.

## Decisiones UX
- Métricas como una sola franja con divisores.
- Remitente/destinatario en 2 columnas dentro de cada panel (`form-card`, `field.wide`).
- Login a dos paneles (marca + formulario); página pública de rastreo con `public-bar`.
- Estados con punto de color además del texto (no depende solo del color).

## Limitaciones conocidas
- No se cambió la lógica JS: confirmaciones siguen usando `confirm()/alert()` nativos (no hay toasts).
- Sin dashboard con gráficos: el backend no entrega series; no se inventaron métricas.
