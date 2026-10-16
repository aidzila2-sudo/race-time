const routeNames = ["speedo", "drag", "history", "settings"];

export function initRouter(onRoute) {
  function activate(route) {
    const next = routeNames.includes(route) ? route : "speedo";
    document.querySelectorAll("[data-view]").forEach((view) => view.classList.toggle("active", view.dataset.view === next));
    document.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === next));
    if (location.hash !== `#${next}`) history.replaceState(null, "", `#${next}`);
    onRoute?.(next);
  }

  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => activate(button.dataset.route)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => activate(button.dataset.go)));
  window.addEventListener("hashchange", () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1));
  return activate;
}
