async function loadComponent(selector, filePath) {
    const element = document.querySelector(selector);
    if (!element) return;
  
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${filePath}`);
      }
  
      const html = await response.text();
      element.innerHTML = html;
    } catch (error) {
      console.error(error);
    }
  }
  
  function setActiveMenu() {
    const currentPage = document.body.dataset.page;
    if (!currentPage) return;
  
    const activeLink = document.querySelector(`.navbar-menu a[data-page="${currentPage}"]`);
    if (activeLink) {
      activeLink.classList.add("active");
    }
  }
  
  function initNavbarScroll() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;
  
    function handleScroll() {
      if (window.scrollY > 40) {
        navbar.classList.add("scrolled");
      } else {
        navbar.classList.remove("scrolled");
      }
    }
  
    window.addEventListener("scroll", handleScroll);
    handleScroll();
  }
  
  function initHamburgerMenu() {
    const toggle = document.getElementById("menu-toggle");
    const panel = document.getElementById("navbar-panel");
    const navLinks = document.querySelectorAll(".navbar-menu a");
  
    if (!toggle || !panel) return;
  
    toggle.addEventListener("click", () => {
      const isOpen = panel.classList.toggle("open");
      toggle.classList.toggle("active");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      document.body.classList.toggle("menu-open", isOpen);
    });
  
    navLinks.forEach(link => {
      link.addEventListener("click", () => {
        panel.classList.remove("open");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
      });
    });
  
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1024) {
        panel.classList.remove("open");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
      }
    });
  }
  
  function initLoginModal() {
    const openBtn = document.getElementById("open-login-modal");
    const closeBtn = document.getElementById("close-login-modal");
    const overlay = document.getElementById("login-modal-overlay");
  
    if (!openBtn || !closeBtn || !overlay) return;
  
    function openModal() {
      overlay.classList.add("active");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("menu-open");
    }
  
    function closeModal() {
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("menu-open");
    }
  
    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
  
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
  
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && overlay.classList.contains("active")) {
        closeModal();
      }
    });
  }
  
  document.addEventListener("DOMContentLoaded", async () => {
    await loadComponent("#header-placeholder", "components/header.html");
    await loadComponent("#footer-placeholder", "components/footer.html");
  
    setActiveMenu();
    initNavbarScroll();
    initHamburgerMenu();
    initLoginModal();
  });