let catalogGrid = document.getElementById('catalog-grid');

const items = {
    "Computadoras y tablets": {
        subcategorias: ["Laptops", "Tablets", "iPads"],
        image: "images/NecesidadesTecnologico.png"
    },
    "Proyectores": {
        subcategorias: ["Proyectores de aula", "Pantallas"],
        image: "images/NecesidadesTecnologico.png"
    },
    "Impresoras": {
        subcategorias: ["Impresoras de tinta", "Impresoras láser"],
        image: "images/NecesidadesTecnologico.png"
    },
    "Conectividad": {
        subcategorias: ["Routers", "Cables de red", "Extensiones"],
        image: "images/NecesidadesTecnologico.png"
    },
    "Software educativo": {
        subcategorias: ["Licencias", "Apps educativas"],
        image: "images/NecesidadesTecnologico.png"
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