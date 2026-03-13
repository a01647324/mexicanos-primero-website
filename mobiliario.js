let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Sillas y mesas escolares": { subcategorias: ["Sillas", "Mesas"], image: "images/NecesidadesMobiliario.png" },
    "Pizarrones y pintarrones": { subcategorias: ["Pizarrones blancos", "Pintarrones"], image: "images/NecesidadesMobiliario.png" },
    "Estantes y libreros": { subcategorias: ["Estantes de madera", "Libreros metálicos"], image: "images/NecesidadesMobiliario.png" },
    "Material de aseo": { subcategorias: ["Escobas", "Trapeadores", "Productos de limpieza"], image: "images/NecesidadesMobiliario.png" },
    "Archiveros y organizadores": { subcategorias: ["Archiveros", "Carpetas", "Organizadores"], image: "images/NecesidadesMobiliario.png" },
};

let loadNeedCards = () => {
    // Insertar botón Atrás antes del grid, dentro del catalog-wrapper
    const wrapper = document.getElementById('catalog-wrapper');
    const btnAtras = document.createElement('div');
    btnAtras.className = 'btn-atras-wrap';
    btnAtras.innerHTML = '<a href="catalogo.html" class="btn-atras">← Atrás</a>';
    wrapper.insertBefore(btnAtras, catalogGrid);

    catalogGrid.innerHTML = '';

    for (let item in items) {
        let data = items[item];
        catalogGrid.innerHTML += `
            <article class="need-card">
                <div class="need-card-imagen">
                    <img src="${data.image}" alt="${item}">
                </div>
                <div class="need-card-cuerpo">
                    <h2 class="need-card-titulo">${item}</h2>
                </div>
            </article>
        `;
    }
};

loadNeedCards();