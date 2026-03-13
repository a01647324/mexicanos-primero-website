let catalogGrid = document.getElementById('catalog-grid');

const materiales = {
    "Hojas blancas y de colores": {
        subcategorias: ["Hojas blancas", "Hojas de colores"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Cartulinas y papelotes": {
        subcategorias: ["Cartulinas", "Papelotes"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Sacapuntas, borradores y tijeras": {
        subcategorias: ["Sacapuntas", "Borradores", "Tijeras"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Plumas, crayolas y lápices": {
        subcategorias: ["Plumas", "Crayolas", "Lápices"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Marcadores y cinta": {
        subcategorias: ["Marcadores", "Cinta adhesiva"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Cuadernos": {
        subcategorias: ["Cuadernos cuadriculados", "Cuadernos rayados"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Plastilina, pintura dáctil, pinceles": {
        subcategorias: ["Plastilina", "Pintura dáctil", "Pinceles"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Juegos de geometría": {
        subcategorias: ["Reglas", "Compases", "Escuadras"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Grapas y engrapadoras": {
        subcategorias: ["Grapas", "Engrapadoras"],
        image: "images/NecesidadesPapeleria.png"
    },
    "Tinta para impresoras": {
        subcategorias: ["Tinta negra", "Tinta de color"],
        image: "images/NecesidadesPapeleria.png"
    }
};

let loadNeedCards = () => {
    // Insertar botón Atrás antes del grid, dentro del catalog-wrapper
    const wrapper = document.getElementById('catalog-wrapper');
    const btnAtras = document.createElement('div');
    btnAtras.className = 'btn-atras-wrap';
    btnAtras.innerHTML = '<a href="catalogo.html" class="btn-atras">← Atrás</a>';
    wrapper.insertBefore(btnAtras, catalogGrid);

    catalogGrid.innerHTML = '';
    for (let material in materiales) {
        let data = materiales[material];
        catalogGrid.innerHTML += `
            <article class="need-card">
                <div class="need-card-imagen">
                    <img src="${data.image}" alt="${material}" onerror="this.style.display='none'">
                </div>
                <div class="need-card-cuerpo">
                    <h2 class="need-card-titulo">${material}</h2>
                </div>
            </article>
        `;
    }
};

loadNeedCards();