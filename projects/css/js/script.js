// script.js

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Deactivate all tabs and sections
      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      // Activate selected tab and its content
      tab.classList.add("active");
      const section = document.getElementById(tab.dataset.tab);
      section.classList.add("active");
    });
  });
});
