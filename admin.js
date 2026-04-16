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