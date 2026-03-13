let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Talleres pedagógicos": { subcategorias: ["Didáctica", "Evaluación", "Planeación"], image: "images/NecesidadesDocentes.png" },
    "Cursos de actualización": { subcategorias: ["Matemáticas", "Lectura", "Ciencias"], image: "images/NecesidadesDocentes.png" },
    "Formación en tecnología": { subcategorias: ["Herramientas digitales", "Plataformas educativas"], image: "images/NecesidadesDocentes.png" },
    "Materiales de apoyo docente": { subcategorias: ["Guías didácticas", "Libros de metodología"], image: "images/NecesidadesDocentes.png" }
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