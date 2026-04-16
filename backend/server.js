import "./loadEnv.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("DB URL:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"));

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(".."));

// ── TEST ──────────────────────────────────────────────────
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend funcionando 🚀" });
});


/* ══════════════════════════════════════════════════════════════
   /api/catalogo
   Devuelve todas las categorías del catálogo visual
   (las tarjetas grandes de catalogo.html)
   con su mapeo a la categoría real de la BD.
   ══════════════════════════════════════════════════════════════ */
app.get("/api/catalogo", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         cc.id,
         cc.nombre,
         cc.imagen,
         cc.link,
         cc.categoria_real_id,
         c.nombre AS categoria_real_nombre
       FROM categorias_catalogo cc
       LEFT JOIN categorias c ON cc.categoria_real_id = c.id
       ORDER BY cc.id`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});
 
/* ══════════════════════════════════════════════════════════════
   /api/catalogo/:id/subcategorias
   Devuelve las subcategorías visuales de una categoría catálogo.
   Ej: /api/catalogo/3/subcategorias → cards de deportivo.html
   Incluye el mapeo a subcategoria_real y categoria_real para
   que el frontend sepa qué filtros pre-seleccionar.
   ══════════════════════════════════════════════════════════════ */
app.get("/api/catalogo/:id/subcategorias", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT
         sc.id,
         sc.nombre,
         sc.imagen,
         sc.categoria_catalogo_id,
         sc.subcategoria_real_id,
         sc.categoria_real_id,
         c.nombre  AS categoria_real_nombre,
         s.nombre  AS subcategoria_real_nombre
       FROM subcategorias_catalogo sc
       LEFT JOIN categorias    c ON sc.categoria_real_id    = c.id
       LEFT JOIN subcategorias s ON sc.subcategoria_real_id = s.id
       WHERE sc.categoria_catalogo_id = $1
       ORDER BY sc.id`,
      [id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});
 
/* ══════════════════════════════════════════════════════════════
   /api/filtros
   Devuelve las opciones para los <select> de filtrado.html.
 
   CAMBIO CLAVE respecto a la versión anterior:
   - categorias    → ahora viene de categorias_catalogo (lo que el
                     usuario ve: "Material didáctico", "Salud", etc.)
   - subcategorias → ahora viene de subcategorias_catalogo
   - municipios y escuelas siguen igual (tablas reales)
 
   El frontend mostrará los nombres del catálogo visual, pero
   al hacer la query real usaremos los IDs reales mapeados.
   ══════════════════════════════════════════════════════════════ */
app.get("/api/filtros", async (req, res) => {
  try {
    const [municipios, categorias, subcategorias, escuelas] = await Promise.all([
      pool.query("SELECT nombre FROM municipios ORDER BY nombre"),
 
      // Categorías visibles = categorias_catalogo
      pool.query(`
        SELECT id, nombre, categoria_real_id
        FROM categorias_catalogo
        ORDER BY nombre
      `),
 
      // Subcategorías visibles = subcategorias_catalogo
      // Incluimos categoria_catalogo_id para poder filtrar
      // subcategorias por categoría seleccionada en el frontend
      pool.query(`
        SELECT
          sc.id,
          sc.nombre,
          sc.categoria_catalogo_id,
          sc.subcategoria_real_id,
          sc.categoria_real_id,
          cc.nombre AS categoria_catalogo_nombre
        FROM subcategorias_catalogo sc
        JOIN categorias_catalogo cc ON sc.categoria_catalogo_id = cc.id
        ORDER BY cc.nombre, sc.nombre
      `),
 
      pool.query("SELECT nombre FROM escuelas ORDER BY nombre"),
    ]);
 
    res.json({
      municipios:    municipios.rows.map(r => r.nombre),
      categorias:    categorias.rows,          // objetos completos con id y categoria_real_id
      subcategorias: subcategorias.rows,        // objetos completos con todos los IDs de mapeo
      escuelas:      escuelas.rows.map(r => r.nombre),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});
 
/* ══════════════════════════════════════════════════════════════
   /api/data  — Filtrado inteligente
   ══════════════════════════════════════════════════════════════
   Parámetros que acepta:
     - municipio       → nombre directo (tabla real)
     - escuela         → nombre directo (tabla real)
     - categoria_id    → ID de categorias_catalogo
                         → se traduce a categoria_real_id → filtra por categorias real
     - subcategoria_id → ID de subcategorias_catalogo
                         → se traduce a subcategoria_real_id → filtra por subcategorias real
 
   Ejemplo de traducción:
     categoria_id=5 (Material didáctico en catálogo)
       → categoria_real_id = 1 (Material en BD real)
       → WHERE c.id = 1
 
     subcategoria_id=12 (Bloques geométricos en catálogo)
       → subcategoria_real_id = 9 (Material didáctico en BD real)
       → WHERE s.id = 9
   ══════════════════════════════════════════════════════════════ */
app.get("/api/data", async (req, res) => {
  try {
    const { municipio, escuela, categoria_id, subcategoria_id } = req.query;
 
    // Paso 1: Si vienen IDs del catálogo, traducirlos a IDs reales
    let categoriaRealId    = null;
    let subcategoriaRealId = null;
 
    if (categoria_id) {
      const catRes = await pool.query(
        "SELECT categoria_real_id FROM categorias_catalogo WHERE id = $1",
        [categoria_id]
      );
      if (catRes.rows.length > 0) {
        categoriaRealId = catRes.rows[0].categoria_real_id;
      }
    }
 
    if (subcategoria_id) {
      const subRes = await pool.query(
        "SELECT subcategoria_real_id FROM subcategorias_catalogo WHERE id = $1",
        [subcategoria_id]
      );
      if (subRes.rows.length > 0) {
        subcategoriaRealId = subRes.rows[0].subcategoria_real_id;
      }
    }
 
    // Paso 2: Construir WHERE dinámico con los IDs reales
    const conditions = [];
    const values     = [];
 
    if (municipio) {
      values.push(municipio);
      conditions.push(`m.nombre = $${values.length}`);
    }
    if (escuela) {
      values.push(escuela);
      conditions.push(`e.nombre = $${values.length}`);
    }
    if (categoriaRealId) {
      values.push(categoriaRealId);
      conditions.push(`c.id = $${values.length}`);
    }
    if (subcategoriaRealId) {
      values.push(subcategoriaRealId);
      conditions.push(`s.id = $${values.length}`);
    }
 
    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
 
    const result = await pool.query(
      `SELECT
         n.id          AS "id",
         e.nombre      AS "Escuela",
         m.nombre      AS "Municipio",
         c.nombre      AS "Categoría",
         s.nombre      AS "Subcategoría",
         n.propuesta   AS "Propuesta",
         n.cantidad    AS "Cantidad",
         n.unidad      AS "Unidad",
         n.estado      AS "Estado"
       FROM necesidades n
       JOIN escuelas     e ON n.escuela_id    = e.id
       JOIN municipios   m ON e.municipio_id  = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias   c ON s.categoria_id  = c.id
       ${whereClause}
       ORDER BY n.id`,
      values
    );
 
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});
 


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});