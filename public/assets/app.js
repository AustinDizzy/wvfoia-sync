(() => {
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if ((form.method || "get").toLowerCase() !== "get") return;

    const toggled = [];
    for (const field of Array.from(form.elements)) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) continue;
      if (!field.name || field.disabled) continue;
      if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) continue;

      if (typeof field.value === "string") field.value = field.value.trim();
      if (field.value !== "") continue;

      field.disabled = true;
      toggled.push(field);
    }

    for (const field of Array.from(form.elements)) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) continue;
      if (!field.name || field.disabled) continue;

      const omitDefault = field.getAttribute("data-omit-default");
      if (!omitDefault) continue;
      if (field.value !== omitDefault) continue;

      field.disabled = true;
      toggled.push(field);
    }

    if (!toggled.length) return;
    setTimeout(() => toggled.forEach((field) => { field.disabled = false; }), 0);
  }, true);

})();
