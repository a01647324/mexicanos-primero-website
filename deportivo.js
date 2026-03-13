let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Balones": {
        subcategorias: ["Fútbol", "Básquetbol", "Voleibol"],
        image: "images/NecesidadesDeportivo.png"
    },
    "Pelotas pequeñas": {
        subcategorias: ["Pelotas"],
        image: "images/NecesidadesDeportivo.png"
    },
    "Cuerdas": {
        subcategorias: ["Cuerdas para saltar"],
        image: "images/NecesidadesDeportivo.png"
    },
    "Conos": {
        subcategorias: ["Conos de plástico"],
        image: "images/NecesidadesDeportivo.png"
    },
    "Porterías": {
        subcategorias: ["Porterías"],
        image: "images/NecesidadesDeportivo.png"
    },
    "Sogas y cuerdas": {
        subcategorias: ["Sogas"],
        image: "images/NecesidadesDeportivo.png"
    },
    "Aros grandes": {
        subcategorias: [ "Aros de gimnasia"],
        image: "images/NecesidadesDeportivo.png"
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