let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Regletas": {
        subcategorias: ["Regletas"],
        image: "images/NecesidadesDidactico.png"
    },
    "Memoramas educativos": {
        subcategorias: ["Memoramas"],
        image: "images/NecesidadesDidactico.png"
    },
    "Juegos de mesa": {
        subcategorias: ["Juegos"],
        image: "images/NecesidadesDidactico.png"
    },
    "Ábacos y material numérico": {
        subcategorias: ["Ábacos", "Bloques lógicos", "Fichas de conteo"],
        image: "images/NecesidadesDidactico.png"
    },
    "Arenas mágicas": {
        subcategorias: ["Interactivo", "Arena"],
        image: "images/NecesidadesDidactico.png"
    },
    "Tapetes de foamy": {
        subcategorias: ["Tapetes"],
        image: "images/NecesidadesDidactico.png"
    },
    "Letras y números de plastico": {
        subcategorias: ["Material sensorial", "Vida práctica"],
        image: "images/NecesidadesDidactico.png"
    },
    "Bloques geométricos": {
        subcategorias: ["Material sensorial", "Vida práctica"],
        image: "images/NecesidadesDidactico.png"
    },
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