let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Salud física": { subcategorias: ["Botiquín", "Medicamentos básicos", "Primeros auxilios"], image: "images/NecesidadesSalud.png" },
    "Salud psicológica": { subcategorias: ["Orientación psicológica", "Talleres emocionales"], image: "images/NecesidadesSalud.png" },
    "Salud visual y auditiva": { subcategorias: ["Lentes", "Auxiliares auditivos"], image: "images/NecesidadesSalud.png" },
    "Nutrición escolar": { subcategorias: ["Desayunos escolares", "Agua potable"], image: "images/NecesidadesSalud.png" },
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