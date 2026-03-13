let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Libros infantiles": {
        subcategorias: ["Cuentos infantiles"],
        image: "images/NecesidadesLiterario.png"
    },
    "Libros informativos": {
        subcategorias: ["Cuentos infantiles", "Novelas juveniles"],
        image: "images/NecesidadesLiterario.png"
    },
    "Diccionarios": {
        subcategorias: ["Diccionarios"],
        image: "images/NecesidadesLiterario.png"
    },
    "Enciclopedias": {
        subcategorias: ["Enciclopedias"],
        image: "images/NecesidadesLiterario.png"
    },
    "Libros en Nahúal": {
        subcategorias: ["Idiomas"],
        image: "images/NecesidadesLiterario.png"
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