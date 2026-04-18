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
  
    const dropdownPages = ["donacion", "voluntariado", "talleres", "vinculaciones", "catalogo"];
    const dropdown = document.querySelector(".nav-dropdown");
  
    if (dropdown && dropdownPages.includes(currentPage)) {
      dropdown.classList.add("active");
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
      localStorage.setItem('loginOrigen', window.location.pathname.split('/').pop() || 'index.html') // ← agrega
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

  function actualizarHeaderSesion() {
    const token  = localStorage.getItem('token')
    const rol    = localStorage.getItem('rol')
    const nombre = localStorage.getItem('nombreDonador')
    const correo = localStorage.getItem('correoDonador')

    const btnLogin = document.getElementById('open-login-modal')
    const perfil   = document.getElementById('navbar-perfil')

    if (!btnLogin || !perfil) return

    if (token && rol === 'donador') {
      btnLogin.style.display = 'none'
      perfil.style.display   = 'flex'

      if (nombre) {
        document.getElementById('navbar-perfil-nombre').textContent  = nombre.split(' ')[0]
        document.getElementById('navbar-avatar').textContent          = nombre.charAt(0).toUpperCase()
        document.getElementById('perfil-dropdown-nombre').textContent = nombre
      }
      if (correo) {
        document.getElementById('perfil-dropdown-correo').textContent = correo
      }
    } else {
      btnLogin.style.display = ''
      perfil.style.display   = 'none'
    }
  }

  function cerrarSesionDonador() {
    localStorage.removeItem('token')
    localStorage.removeItem('rol')
    localStorage.removeItem('nombreDonador')
    localStorage.removeItem('correoDonador')
    window.location.reload()
  }

  function initPerfilDropdown() {
    const toggle   = document.getElementById('perfil-toggle')
    const dropdown = document.getElementById('perfil-dropdown')
    if (!toggle || !dropdown) return

    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.classList.toggle('open')
    })

    document.addEventListener('click', () => {
      dropdown.classList.remove('open')
    })
  }

  function initNavDropdown() {
    const dropdown = document.querySelector(".nav-dropdown");
    const toggle = document.getElementById("nav-dropdown-toggle");
    const menu = document.getElementById("nav-dropdown-menu");
  
    if (!dropdown || !toggle || !menu) return;
  
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });
  
    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("open");
      }
    });
  
    menu.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        dropdown.classList.remove("open");
      });
    });
  }
  
  document.addEventListener("DOMContentLoaded", async () => {
    await loadComponent("#header-placeholder", "components/header.html");
    await loadComponent("#footer-placeholder", "components/footer.html");
  
    setActiveMenu();
    initNavbarScroll();
    initHamburgerMenu();
    initLoginModal();
    actualizarHeaderSesion();
    initPerfilDropdown();
    initNavDropdown();
  });