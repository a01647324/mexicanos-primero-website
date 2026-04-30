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
      localStorage.setItem('loginOrigen', window.location.pathname.split('/').pop() || 'index.html')
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
      // ── Donador logueado ──────────────────────────────────────
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

    } else if (token && (rol === 'admin' || rol === 'lector')) {
      // ── Admin logueado: mostrar avatar y acceso al panel ──────
      btnLogin.style.display = 'none'
      perfil.style.display   = 'flex'

      let nombreAdmin = ''
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        nombreAdmin = payload.nombre || 'Admin'
      } catch(e) {}

      document.getElementById('navbar-perfil-nombre').textContent = nombreAdmin.split(' ')[0] || 'Admin'
      document.getElementById('navbar-avatar').textContent         = nombreAdmin.charAt(0).toUpperCase()

      const dropdownNombre = document.getElementById('perfil-dropdown-nombre')
      const dropdownCorreo = document.getElementById('perfil-dropdown-correo')
      if (dropdownNombre) dropdownNombre.textContent = nombreAdmin
      if (dropdownCorreo) dropdownCorreo.textContent = 'Administrador'

      // Reemplazar botones del dropdown para el rol admin
      const dropdownItem = document.querySelector('.perfil-dropdown-item')
      if (dropdownItem) {
        const irPanel = document.createElement('button')
        irPanel.className   = 'perfil-dropdown-item'
        irPanel.textContent = 'Ir al panel'
        irPanel.onclick     = () => { window.location.href = 'admin.html' }

        const cerrarAdmin = document.createElement('button')
        cerrarAdmin.className   = 'perfil-dropdown-item'
        cerrarAdmin.textContent = 'Cerrar sesión'
        cerrarAdmin.onclick     = () => {
          localStorage.removeItem('token')
          localStorage.removeItem('rol')
          window.location.reload()
        }

        dropdownItem.replaceWith(irPanel)
        irPanel.parentNode.insertBefore(cerrarAdmin, irPanel.nextSibling)
      }

    } else {
      // ── Sin sesión ────────────────────────────────────────────
      btnLogin.style.display = ''
      perfil.style.display   = 'none'
    }
  }

  function cerrarSesionDonador() {
    localStorage.removeItem('token')
    localStorage.removeItem('rol')
    localStorage.removeItem('nombreDonador')
    localStorage.removeItem('correoDonador')
    sessionStorage.removeItem('carrito_donacion');
    localStorage.removeItem('carrito_donacion');
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

  function initFormularioPerfil() {
    function mostrarErrorPerfil(campoId, mensaje) {
      const input = document.getElementById(campoId);
      input.classList.add('is-invalid');
      const anterior = input.parentNode.querySelector('.invalid-feedback');
      if (anterior) anterior.remove();
      const div = document.createElement('div');
      div.className = 'invalid-feedback';
      div.textContent = mensaje;
      input.parentNode.appendChild(div);
    }

    function limpiarErroresPerfil() {
      document.querySelectorAll('#modal-perfil .is-invalid').forEach(el => el.classList.remove('is-invalid'));
      document.querySelectorAll('#modal-perfil .invalid-feedback').forEach(el => el.remove());
    }

    const formPerfil = document.getElementById('form-perfil');
    if (!formPerfil) return;

    formPerfil.addEventListener('submit', async function(e) {
      e.preventDefault();
      limpiarErroresPerfil();

      const token = localStorage.getItem('token');
      if (!token) return;

      const nombre = document.getElementById('perfil-nombre').value.trim();
      const correo = document.getElementById('perfil-correo').value.trim();
      const fecha  = document.getElementById('perfil-fecha').value;
      const estado = document.getElementById('perfil-estado').value;

      let hayErrores = false;

      const partes = nombre.split(' ').filter(p => p.length > 0);
      if (!nombre) {
        mostrarErrorPerfil('perfil-nombre', 'El nombre es requerido.');
        hayErrores = true;
      } else if (partes.length < 2) {
        mostrarErrorPerfil('perfil-nombre', 'Ingresa tu nombre completo (nombre y apellido).');
        hayErrores = true;
      }

      const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!correo) {
        mostrarErrorPerfil('perfil-correo', 'El correo es requerido.');
        hayErrores = true;
      } else if (!regexCorreo.test(correo)) {
        mostrarErrorPerfil('perfil-correo', 'Ingresa un correo electrónico válido.');
        hayErrores = true;
      }

      if (!fecha) {
        mostrarErrorPerfil('perfil-fecha', 'La fecha de nacimiento es requerida.');
        hayErrores = true;
      } else {
        const fechaNac = new Date(fecha);
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        if (hoy.getMonth() < fechaNac.getMonth() ||
          (hoy.getMonth() === fechaNac.getMonth() && hoy.getDate() < fechaNac.getDate())) edad--;
        if (edad < 18) {
          mostrarErrorPerfil('perfil-fecha', 'Debes ser mayor de 18 años.');
          hayErrores = true;
        }
      }

      if (!estado) {
        mostrarErrorPerfil('perfil-estado', 'Debes seleccionar tu estado.');
        hayErrores = true;
      }

      if (hayErrores) return;

      try {
        const response = await fetch('http://localhost:3000/api/donador/perfil', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ nombre_completo: nombre, correo, fecha_nacimiento: fecha || null, estado_geografico: estado })
        });

        const data = await response.json();

        if (response.ok) {
          alert('Perfil actualizado correctamente');
          cerrarModalPerfil();
          localStorage.setItem('nombreDonador', nombre);
          localStorage.setItem('correoDonador', correo);
          actualizarHeaderSesion();
        } else {
          const msg = data.error || 'Error al actualizar perfil';
          if (msg.includes('nombre')) mostrarErrorPerfil('perfil-nombre', msg);
          else if (msg.includes('correo') || msg.includes('cuenta')) mostrarErrorPerfil('perfil-correo', msg);
          else if (msg.includes('18')) mostrarErrorPerfil('perfil-fecha', msg);
          else alert(msg);
        }
      } catch (error) {
        alert('Error de conexión');
      }
    });
  }

// ═══════════════════════════════════════════════════════════════
// MODALES DE PERFIL E HISTORIAL
// ═══════════════════════════════════════════════════════════════

window.abrirModalHistorial = async function() {
  const modal = document.getElementById('modal-historial');
  if (!modal) return;

  modal.classList.add('activo');
  
  const loading = document.getElementById('historial-loading');
  const content = document.getElementById('historial-content');
  const vacio = document.getElementById('historial-vacio');
  
  // Mostrar loading
  loading.style.display = 'block';
  content.style.display = 'none';
  vacio.style.display = 'none';

  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://localhost:3000/api/donador/historial', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    
    loading.style.display = 'none';

    if (data.data && data.data.length > 0) {
      mostrarHistorial(data.data);
      content.style.display = 'block';
    } else {
      vacio.style.display = 'block';
    }

  } catch (error) {
    console.error('Error cargando historial:', error);
    loading.style.display = 'none';
    vacio.style.display = 'block';
  }
};

window.cerrarModalHistorial = function() {
  const modal = document.getElementById('modal-historial');
  if (modal) modal.classList.remove('activo');
};

function mostrarHistorial(donaciones) {
  const lista = document.getElementById('historial-lista');
  if (!lista) return;

  const html = donaciones.map(donacion => {
    const fecha = new Date(donacion.created_at).toLocaleDateString('es-MX');
    const estadoBadge = getEstadoBadge(donacion.estatus_gestion);
    
    const materialesHtml = donacion.materiales.length > 0 ? 
      donacion.materiales.map(m => 
        `<small class="d-block text-muted"><strong>${m.escuela}:</strong> ${m.propuesta} (${m.cantidad} ${m.unidad})</small>`
      ).join('<hr style="border:none; border-top:1px solid #eee; margin: 0.4rem 0;">') : 
      '<small class="text-muted">Donación sin materiales específicos</small>';

    return `
      <div class="historial-item mb-3 p-3 rounded">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h6 class="mb-1">${donacion.tipo_donacion || 'Donación General'}</h6>
          ${estadoBadge}
        </div>
        <p class="mb-1 small text-muted">
          <i class="bi bi-calendar3"></i> ${fecha}
        </p>
        <div class="mt-2">
          ${materialesHtml}
        </div>
      </div>
    `;
  }).join('');

  lista.innerHTML = html;
}

function getEstadoBadge(estatus) {
  switch(estatus) {
    case 'completada': return '<span class="badge bg-success">Completada</span>';
    case 'en_proceso': return '<span class="badge bg-warning">En Proceso</span>';
    case 'nueva': return '<span class="badge bg-primary">Nueva</span>';
    default: return '<span class="badge bg-secondary">Pendiente</span>';
  }
}

window.abrirModalPerfil = async function() {
  const modal = document.getElementById('modal-perfil');
  if (!modal) return;

  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const response = await fetch('http://localhost:3000/api/donador/perfil', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const perfil = data.data;
      
      const fechaFormateada = perfil.fecha_nacimiento 
        ? perfil.fecha_nacimiento.split('T')[0] 
        : '';

      document.getElementById('perfil-nombre').value = perfil.nombre_completo || '';
      document.getElementById('perfil-correo').value = perfil.correo || '';
      document.getElementById('perfil-fecha').value  = fechaFormateada;
      document.getElementById('perfil-estado').value = perfil.estado_geografico || '';
    } else {
      const payload = JSON.parse(atob(token.split('.')[1]));
      document.getElementById('perfil-nombre').value = payload.nombre || '';
      document.getElementById('perfil-correo').value = payload.correo || '';
    }
    
  } catch (error) {
    console.error('Error cargando perfil:', error);
  }

  modal.classList.add('activo');
};

window.cerrarModalPerfil = function() {
  const modal = document.getElementById('modal-perfil');
  if (modal) modal.classList.remove('activo');
};
  
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
    initFormularioPerfil();
  });