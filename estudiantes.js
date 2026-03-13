let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Talleres extracurriculares": { subcategorias: ["Arte", "Música", "Teatro"], image: "images/NecesidadesEstudiantes.png" },
    "Visitas extraescolares": { subcategorias: ["Museos", "Zoológicos", "Espacios culturales"], image: "images/NecesidadesEstudiantes.png" },
    "Programas de liderazgo": { subcategorias: ["Habilidades socioemocionales", "Trabajo en equipo"], image: "images/NecesidadesEstudiantes.png" },
    "Apoyo académico": { subcategorias: ["Tutorías", "Asesorías", "Reforzamiento"], image: "images/NecesidadesEstudiantes.png" },
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