// Componente de paginación reutilizable. onChange(page) se llama cuando el
// usuario navega a otra página; el llamador es responsable de volver a
// pedir los datos y llamar a update() con la respuesta.
export function createPager(container, onChange) {
  container.innerHTML = `
    <button type="button" class="btn btn-outline btn-sm" data-prev>&lsaquo; Anterior</button>
    <span class="pager-info" data-info></span>
    <button type="button" class="btn btn-outline btn-sm" data-next>Siguiente &rsaquo;</button>
  `;
  const prevBtn = container.querySelector("[data-prev]");
  const nextBtn = container.querySelector("[data-next]");
  const info = container.querySelector("[data-info]");

  prevBtn.addEventListener("click", () => onChange(current.page - 1));
  nextBtn.addEventListener("click", () => onChange(current.page + 1));

  let current = { page: 1, total: 0, pageSize: 20 };

  function update({ page, total, pageSize }) {
    current = { page, total, pageSize };
    if (total === 0) {
      container.style.display = "none";
      return;
    }
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    info.textContent = `Página ${page} de ${totalPages} · ${total} resultado${total === 1 ? "" : "s"}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    container.style.display = "flex";
  }

  return { update };
}
