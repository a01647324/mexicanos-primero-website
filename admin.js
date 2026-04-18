// ============================================================
// admin.js — Lógica de navegación del sidebar con fetch
// ============================================================

// 1. Referencias a los elementos del DOM

const links = document.querySelectorAll('.sidebar-link');
const contenedor = document.getElementById('content');

// 2. Función que cambia de sección

function cambiarSeccion(seccion) {

  // Quitar "active" de todos los links
  links.forEach(function(link) {
    link.classList.remove('active');
  });

  // Poner "active" en el link correspondiente
  var linkActivo = document.querySelector('.sidebar-link[data-section="' + seccion + '"]');
  if (linkActivo) {
    linkActivo.classList.add('active');
  }

  // Hacer fetch del fragmento HTML
  fetch('fragments/' + seccion + '.html')
    .then(function(respuesta) {
      if (!respuesta.ok) {
        throw new Error('No se encontró la sección: ' + seccion);
      }
      return respuesta.text();
    })
    .then(function(html) {
      // Inyectar el HTML
      contenedor.innerHTML = html;

      // Buscar todos los <script> inyectados y ejecutarlos manualmente
      var scripts = contenedor.querySelectorAll('script');
      scripts.forEach(function(scriptViejo) {
        var scriptNuevo = document.createElement('script');

        // Si el script tiene src (archivo externo), copiar el src
        if (scriptViejo.src) {
          scriptNuevo.src = scriptViejo.src;
        } else {
          // Si es inline, copiar el contenido
          scriptNuevo.textContent = scriptViejo.textContent;
        }

        // Reemplazar el script viejo (inerte) por el nuevo (ejecutable)
        scriptViejo.parentNode.replaceChild(scriptNuevo, scriptViejo);
      });
    })
    .catch(function(error) {
      contenedor.innerHTML = '<h1>Error</h1><p>' + error.message + '</p>';
      console.error(error);
    });
}

// 3. Escuchar clicks en cada link del sidebar

links.forEach(function(link) {

  link.addEventListener('click', function(evento) {

    evento.preventDefault();

    const seccion = link.getAttribute('data-section');

    cambiarSeccion(seccion);
  });
});

// 4. Cargar la sección por defecto al abrir la página

cambiarSeccion('panel');

// ── Cerrar sesión admin ───────────────────────────────────────
function adminCerrarSesion(e) {
  e.preventDefault();
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  localStorage.removeItem('nombreDonador');
  localStorage.removeItem('correoDonador');
  window.location.href = 'login-admin.html';
}

// ── Poblar nombre e inicial del admin en el header ───────────
(function() {
  var token = localStorage.getItem('token');
  if (!token) return;
  try {
    var payload = JSON.parse(atob(token.split('.')[1]));

    // Nombre en el header
    var nombreEl = document.querySelector('.admin-nombre');
    if (nombreEl && payload.nombre) nombreEl.textContent = payload.nombre;

    // Avatar: inicial + color (misma lógica que equipo.html)
    var avatarEl = document.getElementById('admin-avatar-inicial');
    if (avatarEl && payload.nombre) {
      var colores = ['#007526','#1C3661','#c47a0a','#6432a0','#EC671B','#dc2626','#0891b2'];
      var inicial = payload.nombre.charAt(0).toUpperCase();
      var color   = colores[payload.nombre.charCodeAt(0) % colores.length];
      avatarEl.textContent       = inicial;
      avatarEl.style.background  = color;
    }
  } catch(e) {}
})();