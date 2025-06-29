// script.js

document.addEventListener("DOMContentLoaded", () => {
  const navLinks = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".tab-content");

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      // Remove active classes
      navLinks.forEach((l) => l.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      // Add active class to clicked link and corresponding section
      const targetId = link.getAttribute("href").substring(1);
      document.getElementById(targetId).classList.add("active");
      link.classList.add("active");
    });
  });
});
