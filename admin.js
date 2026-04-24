const links = document.querySelectorAll('.sidebar-link');
const contenedor = document.getElementById('content');

// Función que cambia de sección

function cambiarSeccion(seccion) {

  // Quitar active de los links
  links.forEach(function(link) {
    link.classList.remove('active');
  });

  var linkActivo = document.querySelector('.sidebar-link[data-section="' + seccion + '"]');
  if (linkActivo) {
    linkActivo.classList.add('active');
  }

  // Fetch del fragmento HTML
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

      // Buscar todos los <script> inyectados y ejecutarlos
      var scripts = contenedor.querySelectorAll('script');
      scripts.forEach(function(scriptViejo) {
        var scriptNuevo = document.createElement('script');

        if (scriptViejo.src) {
          scriptNuevo.src = scriptViejo.src;
        } else {
          scriptNuevo.textContent = scriptViejo.textContent;
        }

        scriptViejo.parentNode.replaceChild(scriptNuevo, scriptViejo);
      });
    })
    .catch(function(error) {
      contenedor.innerHTML = '<h1>Error</h1><p>' + error.message + '</p>';
      console.error(error);
    });
}

links.forEach(function(link) {

  link.addEventListener('click', function(evento) {

    evento.preventDefault();

    const seccion = link.getAttribute('data-section');

    cambiarSeccion(seccion);
  });
});

cambiarSeccion('panel');

// Cerrar sesión
function adminCerrarSesion(e) {
  e.preventDefault();
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  localStorage.removeItem('nombreDonador');
  localStorage.removeItem('correoDonador');
  window.location.href = 'login-admin.html';
}

function adminFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  var token = localStorage.getItem('token');
  if (token) options.headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, options);
}

var ADMIN_ROL = 'lector';

function adminPuedeEditar() {
  return ADMIN_ROL === 'admin';
}

(function() {
  var token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login-admin.html'; return; }

  try {
    var payload = JSON.parse(atob(token.split('.')[1]));

    if (payload.rol !== 'admin' && payload.rol !== 'lector') {
      window.location.href = 'login-admin.html'; return;
    }

    ADMIN_ROL = payload.rol;

    var nombreEl = document.querySelector('.admin-nombre');
    if (nombreEl && payload.nombre) nombreEl.textContent = payload.nombre;

    var avatarEl = document.getElementById('admin-avatar-inicial');
    if (avatarEl && payload.nombre) {
      var colores = ['#007526','#1C3661','#c47a0a','#6432a0','#EC671B','#dc2626','#0891b2'];
      avatarEl.textContent      = payload.nombre.charAt(0).toUpperCase();
      avatarEl.style.background = colores[payload.nombre.charCodeAt(0) % colores.length];
    }

    // Etiqueta "Solo lectura"
    if (ADMIN_ROL === 'lector' && nombreEl) {
      nombreEl.insertAdjacentHTML('afterend',
        '<span style="font-size:.68rem;font-weight:700;background:rgba(28,54,97,.1);color:var(--azul);padding:.15rem .55rem;border-radius:50px;margin-left:.4rem;">Solo lectura</span>'
      );
    }

  } catch(e) {
    window.location.href = 'login-admin.html';
  }
})();