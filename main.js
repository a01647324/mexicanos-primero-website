/*
-------------------------------------------------------------------------------
PÁGINA PRINCIPAL
-------------------------------------------------------------------------------
*/

/* ── MENÚ HAMBURGUESA ── */
const btnLineas = document.getElementById('lineas');
const menuDesplegable = document.getElementById('menuDesplegable');

if (btnLineas && menuDesplegable) {
    btnLineas.addEventListener('click', function() {
        btnLineas.classList.toggle('abierto');
        menuDesplegable.classList.toggle('abierto');
    });

    document.addEventListener('click', function(e) {
        const clickFueraDelBoton = !btnLineas.contains(e.target);
        const clickFueraDelMenu  = !menuDesplegable.contains(e.target);

        if (clickFueraDelBoton && clickFueraDelMenu) {
            btnLineas.classList.remove('abierto');
            menuDesplegable.classList.remove('abierto');
        }
    });
}

/* ── BARRA DE PROGRESO PRINCIPAL ── */
const barraPrincipal = document.getElementById('barra-principal');
const etiquetaPct    = document.getElementById('pct-label');

if (barraPrincipal) {

    /* Se activa cuando la barra entra al viewport */
    const observadorBarra = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {

                const objetivo = Math.min(parseInt(barraPrincipal.dataset.objetivo) || 68, 100);
                let actual = 0;

                /* Incrementa 1% cada 20ms hasta llegar al objetivo */
                const intervalo = setInterval(function() {
                    actual += 1;
                    barraPrincipal.style.width = actual + '%';
                    if (etiquetaPct) etiquetaPct.textContent = actual + '%';

                    if (actual >= objetivo) {
                        clearInterval(intervalo);
                    }
                }, 20);

                /* Deja de observar para que la animación no se repita */
                observadorBarra.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    observadorBarra.observe(barraPrincipal);
}

/* ── MINI BARRAS DE PROGRESO ── */
const miniBarras = document.querySelectorAll('.barra-mini');

if (miniBarras.length > 0) {

    /* Fuerza el ancho inicial en 0 antes de observar */
    miniBarras.forEach(function(barra) {
        barra.style.width = '0%';
    });

    const observadorMini = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                const barra = entry.target;
                const anchoObjetivo = Math.min(parseInt(barra.dataset.w) || 50, 100);

                /* Delay aumentado para que el navegador registre el estado inicial */
                setTimeout(function() {
                    barra.style.width = anchoObjetivo + '%';
                }, 200);

                observadorMini.unobserve(barra);
            }
        });
    }, { threshold: 0.2 });

    miniBarras.forEach(function(barra) {
        observadorMini.observe(barra);
    });
}

/*
-------------------------------------------------------------------------------
FAQ
-------------------------------------------------------------------------------
*/

const preguntasFaq = document.querySelectorAll('.faq-pregunta');

if (preguntasFaq.length > 0) {

  preguntasFaq.forEach(function(botonPregunta) {

    botonPregunta.addEventListener('click', function() {
      const itemActual = botonPregunta.parentElement;
      const yaEstabaAbierto = itemActual.classList.contains('abierto');

      document.querySelectorAll('.faq-item').forEach(function(item) {
        item.classList.remove('abierto');
        item.querySelector('.faq-respuesta').classList.remove('abierto');
      });

      if (!yaEstabaAbierto) {
        itemActual.classList.add('abierto');
        itemActual.querySelector('.faq-respuesta').classList.add('abierto');
      }
    });
  });
}

/*
-------------------------------------------------------------------------------
TERMINOS Y CONDICIONES FORMULARIO
CONTACTANOS
-------------------------------------------------------------------------------
*/
const modalTerminos   = document.getElementById('modal-terminos');
const checkTerminos   = document.getElementById('check-terminos');
const btnAceptar      = document.getElementById('btn-aceptar-terminos');
const modalFormulario = document.getElementById('modal-formulario');

window.abrirTerminos = function() {
  if (!modalTerminos) return;
  modalTerminos.classList.add('activo');
  if (checkTerminos) checkTerminos.checked = false;
  if (btnAceptar)    btnAceptar.disabled = true;
};

window.cerrarTerminos = function() {
  if (modalTerminos) modalTerminos.classList.remove('activo');
};

if (checkTerminos) {
  checkTerminos.addEventListener('change', function() {
    btnAceptar.disabled = !checkTerminos.checked;
  });
}

if (btnAceptar) {
  btnAceptar.addEventListener('click', function() {
    cerrarTerminos();
    if (modalFormulario) modalFormulario.classList.add('activo');
  });
}

if (modalTerminos) {
  modalTerminos.addEventListener('click', function(e) {
    if (e.target === modalTerminos) cerrarTerminos();
  });
}


window.cerrarFormulario = function() {
  if (modalFormulario) modalFormulario.classList.remove('activo');
};

if (modalFormulario) {
  modalFormulario.addEventListener('click', function(e) {
    if (e.target === modalFormulario) cerrarFormulario();
  });
}

window.enviarFormulario = function() {
  alert('¡Gracias! Tu mensaje fue enviado. Nos pondremos en contacto contigo pronto 💚');
  cerrarFormulario();
};


/*
-------------------------------------------------------------------------------
CATALOGO
-------------------------------------------------------------------------------
*/
let catalogGrid = document.getElementById('catalog-grid');


/* DATA */
const needcategory = {
    "Otros": {
        categories: [],
        image: "images/otros.png",
        link: "otros.html"
    },

    "Material de papelería": {
        categories: ["Material de papelería"],
        image: "images/cuadernos.png",
        link: "papeleria.html"
    },

    "Material literario": {
        categories: ["Material literario"],
        image: "images/material literario.png",
        link: "literario.html"
    },

    "Material deportivo": {
        categories: ["Material de educación física"],
        image: "images/material deportivo.png",
        link: "deportivo.html"
    },

    "Material didáctico": {
        categories: ["Material didáctico"],
        image: "images/materialDidactico.png",
        link: "didactico.html"
    },

    "Material tecnológico": {
        categories: ["Material tecnológico", "Servicio tecnológico"],
        image: "images/materialTecnologico.png",
        link: "tecnologico.html"
    },

    "Mobiliario": {
        categories: ["Mobiliario", "Pizarrones / pintarrones", "Material de aseo"],
        image: "images/Mobiliario.png",
        link: "mobiliario.html"
    },

    "Infraestructura": {
        categories: [
            "Construcción materiales",
            "Material - construcción",
            "Servicio de mantenimiento",
            "Construcción servicio"
        ],
        image: "images/Infraestructura.png",
        link: "infraestructura.html"
    },

    "Formación a docentes": {
        categories: ["Formación para docentes"],
        image: "images/FormacionADocentes.png",
        link: "docentes.html"
    },

    "Formación a estudiantes": {
        categories: ["Formación para estudiantes", "Visita extraescolar educativa"],
        image: "images/formacionAEstudiantes.png",
        link: "estudiantes.html"
    },

    "Formación a familias": {
        categories: ["Formación para familias"],
        image: "images/FormacionAFamilias.png",
        link: "familias.html"
    },

    "Acceso": {
        categories: ["Transporte"],
        image: "images/acceso.png",
        link: "acceso.html"
    },

    "Salud": {
        categories: ["Salud física", "Salud psicológica", "Salud material"],
        image: "images/Salud.png",
        link: "salud.html"
    }
};


let loadNeedCards = () => {
    for (let category in needcategory) {

        let catData = needcategory[category];
        catalogGrid.innerHTML += `
            <article class="need-card">
                <div class="need-card-imagen">
                    <img src="${catData.image}" alt="${category}">
                </div>
                <div class="need-card-cuerpo">
                    <h2 class="need-card-titulo">${category}</h2>
                    <div class="need-card-cta">
                    
                        <button class="btn-ver" onclick="location.href='${catData.link}'">
                            Ver necesidades →
                        </button>
                    </div>
                </div>
            </article>
        `;
    }
}

if (catalogGrid) { loadNeedCards(); }


/*
-------------------------------------------------------------------------------
FILTRADO
-------------------------------------------------------------------------------
*/

// llena los menus y muestra todo el catalogo al cargar
function loadFilters() {
  const municipioSelect = document.getElementById("municipioSelect");
  const categoriaSelect = document.getElementById("categoriaSelect");
  const subcategoriaSelect = document.getElementById("subcategoriaSelect");
  const escuelaSelect = document.getElementById("escuelaSelect");

  let municipiosUnicos = [];
  for (let i = 0; i < data.length; i++) {
    let m = data[i].Municipio;
    if (!municipiosUnicos.includes(m)) {
      municipiosUnicos.push(m);
      let option = document.createElement("option");
      option.value = m; option.textContent = m;
      municipioSelect.appendChild(option);
    }
  }

  let categoriasUnicas = [];
  for (let i = 0; i < data.length; i++) {
    let c = data[i].Categoría;
    if (!categoriasUnicas.includes(c)) {
      categoriasUnicas.push(c);
      let option = document.createElement("option");
      option.value = c; option.textContent = c;
      categoriaSelect.appendChild(option);
    }
  }

  for (let i = 0; i < subcategorias.data.length; i++) {
    let s = subcategorias.data[i];
    let option = document.createElement("option");
    option.value = s; option.textContent = s;
    subcategoriaSelect.appendChild(option);
  }

  let escuelasUnicas = [];
  for (let i = 0; i < data.length; i++) {
    let e = data[i].Escuela;
    if (!escuelasUnicas.includes(e)) {
      escuelasUnicas.push(e);
      let option = document.createElement("option");
      option.value = e; option.textContent = e;
      escuelaSelect.appendChild(option);
    }
  }

  // muestra todo el catalogo al cargar
  search(null);
}

// carrito de donaciones
let carrito = [];

function agregarAlCarrito(index, seleccionados, cantidad) {
  const item = data[index];
  seleccionados.forEach(function(sel) {
    const yaExiste = carrito.some(function(c) {
      return c.Escuela === item.Escuela && c.Propuesta === sel;
    });
    if (!yaExiste) {
      carrito.push({
        Escuela: item.Escuela,
        Propuesta: sel,
        Cantidad: cantidad,
        Unidad: item.Unidad || ''
      });
    }
  });
  renderCarrito();
  abrirCarrito();
}

function quitarDelCarrito(index) {
  carrito.splice(index, 1);
  renderCarrito();
}

function renderCarrito() {
  const lista = document.getElementById("carrito-lista");
  lista.innerHTML = "";
  document.getElementById("carrito-count").textContent = carrito.length;

  if (carrito.length === 0) {
    lista.innerHTML = "<p class='carrito-vacio'>Aún no has seleccionado ninguna donación.</p>";
    return;
  }

  for (let i = 0; i < carrito.length; i++) {
    let item = carrito[i];
    let el = document.createElement("div");
    el.className = "carrito-item";
    el.innerHTML =
      "<div class='carrito-item-info'>" +
        "<strong>" + item.Escuela + "</strong>" +
        "<span>" + item.Propuesta + " — " + item.Cantidad + " " + item.Unidad + "</span>" +
      "</div>" +
      "<button class='carrito-quitar' onclick='quitarDelCarrito(" + i + ")'>✕</button>";
    lista.appendChild(el);
  }
}

function abrirCarrito() {
  document.getElementById("carrito-panel").classList.add("abierto");
}

function cerrarCarrito() {
  document.getElementById("carrito-panel").classList.remove("abierto");
}


function search(event) {
  if (event) event.preventDefault();

  const escuela = document.getElementById("escuelaSelect").value;
  const municipio = document.getElementById("municipioSelect").value;
  const categoria = document.getElementById("categoriaSelect").value;
  const subcategoria = document.getElementById("subcategoriaSelect").value;

  let filtered = [];
  for (let i = 0; i < data.length; i++) {
    let item = data[i];
    let ok =
      (!escuela    || item.Escuela    === escuela)    &&
      (!municipio  || item.Municipio  === municipio)  &&
      (!categoria  || item.Categoría  === categoria)  &&
      (!subcategoria || item.Subcategoría === subcategoria);
    if (ok) filtered.push({ item: item, index: i });
  }

  renderResults(filtered);
}

function renderResults(filtered) {
  const results = document.getElementById("results");
  results.innerHTML = "";

  if (filtered.length === 0) {
    results.innerHTML = "<p class='sin-resultados'>No se encontraron resultados.</p>";
    return;
  }

  for (let i = 0; i < filtered.length; i++) {
    let item = filtered[i].item;
    let index = filtered[i].index;

    let estadoClase = item.Estado === "Cubierto" ? "estado-cubierto" : "estado-pendiente";

    let card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      "<div class='card-header'>" +
        "<h3>" + item.Escuela + "</h3>" +
        "<button class='btn-agregar' onclick='abrirModalDonar(" + index + ")' title='Donar'>Donar</button>" +
      "</div>" +
      "<p><strong>Municipio:</strong> " + item.Municipio + "</p>" +
      "<p><strong>Categoría:</strong> " + item.Categoría + "</p>" +
      "<p><strong>Subcategoría:</strong> " + item.Subcategoría + "</p>" +
      "<p><strong>Propuesta:</strong> " + item.Propuesta + "</p>" +
      "<p><strong>Cantidad:</strong> " + item.Cantidad + " " + item.Unidad + "</p>" +
      "<p><span class='estado " + estadoClase + "'>" + item.Estado + "</span></p>";

    results.appendChild(card);
  }
}


if (document.getElementById("searchForm")) {
  document.getElementById("searchForm").addEventListener("submit", search);
  document.getElementById("escuelaSelect").addEventListener("change", search);
  document.getElementById("municipioSelect").addEventListener("change", search);
  document.getElementById("categoriaSelect").addEventListener("change", search);
  document.getElementById("subcategoriaSelect").addEventListener("change", search);

  loadFilters();
}


/*
-------------------------------------------------------------------------------
MODAL DONAR (act)
-------------------------------------------------------------------------------
*/

function abrirModalDonar(index) {
  const item = data[index];
  const modal = document.getElementById('modal-donar');
  const titulo = document.getElementById('modal-donar-titulo');
  const lista = document.getElementById('modal-donar-lista');

  titulo.textContent = item.Escuela + ' — ' + item.Propuesta;

  // Busca todas las propuestas de la misma escuela y categoría como opciones
  const opciones = [];
  for (let i = 0; i < data.length; i++) {
    if (
      data[i].Escuela === item.Escuela &&
      data[i].Categoría === item.Categoría &&
      !opciones.includes(data[i].Propuesta)
    ) {
      opciones.push(data[i].Propuesta);
    }
  }

  lista.innerHTML = '';
  opciones.forEach(function(op) {
    lista.innerHTML +=
      "<label class='modal-opcion'>" +
        "<input type='checkbox' value='" + op + "'> " + op +
      "</label>";
  });

  document.getElementById('modal-donar-cantidad').value = '';
  modal.dataset.index = index;
  modal.classList.add('activo');
}

function cerrarModalDonar() {
  document.getElementById('modal-donar').classList.remove('activo');
}

function confirmarModalDonar() {
  const modal = document.getElementById('modal-donar');
  const index = parseInt(modal.dataset.index);
  const cantidad = document.getElementById('modal-donar-cantidad').value;
  const seleccionados = Array.from(
    modal.querySelectorAll('input[type=checkbox]:checked')
  ).map(function(cb) { return cb.value; });

  if (seleccionados.length === 0 || !cantidad) {
    alert('Selecciona al menos un ítem e ingresa una cantidad.');
    return;
  }

  agregarAlCarrito(index, seleccionados, cantidad);
  cerrarModalDonar();
}

if (document.getElementById('modal-donar')) {
  document.getElementById('modal-donar').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalDonar();
  });
}