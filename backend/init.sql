CREATE TYPE estado_necesidad AS ENUM ('Cubierto', 'Aun no cubierto', 'Cubierto parcialmente');

-- ─── TABLA: municipios ───
CREATE TABLE municipios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

-- ─── TABLA: categorias ───
CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

-- ─── TABLA: subcategorias ───
CREATE TABLE subcategorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    categoria_id INT NOT NULL,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- ─── TABLA: escuelas ───
CREATE TABLE escuelas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    municipio_id INT NOT NULL,
    FOREIGN KEY (municipio_id) REFERENCES municipios(id)
);

-- ─── TABLA: necesidades ───
CREATE TABLE necesidades (
    id SERIAL PRIMARY KEY,
    escuela_id INT NOT NULL,
    subcategoria_id INT NOT NULL,
    propuesta VARCHAR(255) NOT NULL,
    cantidad INT NOT NULL,
    unidad VARCHAR(50),
    estado estado_necesidad DEFAULT 'Aun no cubierto',
    detalles TEXT,
    FOREIGN KEY (escuela_id) REFERENCES escuelas(id),
    FOREIGN KEY (subcategoria_id) REFERENCES subcategorias(id)
);