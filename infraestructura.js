let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Construcción y materiales": { subcategorias: ["Cemento", "Tabique", "Varilla"], image: "images/NecesidadesInfraestructura.png" },
    "Servicio de mantenimiento": { subcategorias: ["Plomería", "Electricidad", "Pintura"], image: "images/NecesidadesInfraestructura.png" },
    "Techos y muros": { subcategorias: ["Láminas", "Blocks", "Impermeabilizante"], image: "images/NecesidadesInfraestructura.png" },
    "Instalaciones sanitarias": { subcategorias: ["Baños", "Lavamanos", "Tuberías"], image: "images/NecesidadesInfraestructura.png" },
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