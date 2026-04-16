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

/* ══════════════════════════════════════════════════════════
   /api/data  — Filtrado dinámico por query params
   ══════════════════════════════════════════════════════════
   Ejemplos de uso:
     GET /api/data
     GET /api/data?municipio=Zapopan
     GET /api/data?municipio=Zapopan&categoria=Infraestructura
     GET /api/data?subcategoria=Pizarrones%20%2F%20pintarrones

   Construimos el WHERE dinámicamente según los filtros que
   lleguen. Los valores NUNCA se concatenan al SQL directo —
   se pasan como parámetros ($1, $2, ...) al pool.query para
   evitar SQL injection.
   ══════════════════════════════════════════════════════════ */

app.get("/api/data", async (req, res) => {
  try {
    const { municipio, categoria, subcategoria, escuela } = req.query;

    // Arrays paralelos: conditions guarda los fragmentos del WHERE,
    // values guarda los valores que los reemplazan.
    const conditions = [];
    const values = [];

    if (municipio) {
      values.push(municipio);
      conditions.push(`m.nombre = $${values.length}`);
    }
    if (categoria) {
      values.push(categoria);
      conditions.push(`c.nombre = $${values.length}`);
    }
    if (subcategoria) {
      values.push(subcategoria);
      conditions.push(`s.nombre = $${values.length}`);
    }
    if (escuela) {
      values.push(escuela);
      conditions.push(`e.nombre = $${values.length}`);
    }

    // Si hay condiciones, las unimos con AND; si no, WHERE va vacío.
    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await pool.query(
      `SELECT 
         n.id AS "id",
         e.nombre AS "Escuela",
         m.nombre AS "Municipio",
         c.nombre AS "Categoría",
         s.nombre AS "Subcategoría",
         n.propuesta AS "Propuesta",
         n.cantidad AS "Cantidad",
         n.unidad AS "Unidad",
         n.estado AS "Estado"
       FROM necesidades n
       JOIN escuelas e ON n.escuela_id = e.id
       JOIN municipios m ON e.municipio_id = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias c ON s.categoria_id = c.id
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

/* ══════════════════════════════════════════════════════════
   /api/filtros  — Opciones para los <select> del frontend
   ══════════════════════════════════════════════════════════
   Con filtrado en servidor, el frontend ya no puede sacar las
   opciones de los <select> del array de datos (porque el array
   cambia con cada búsqueda). Este endpoint devuelve las listas
   completas de cada tabla para llenar los dropdowns una sola vez
   al cargar la página.

   Usamos Promise.all para lanzar las 4 queries en paralelo en
   vez de en serie. En serie tardaría ~4x más.
   ══════════════════════════════════════════════════════════ */

app.get("/api/filtros", async (req, res) => {
  try {
    const [municipios, categorias, subcategorias, escuelas] = await Promise.all([
      pool.query("SELECT nombre FROM municipios ORDER BY nombre"),
      pool.query("SELECT nombre FROM categorias ORDER BY nombre"),
      pool.query("SELECT nombre FROM subcategorias ORDER BY nombre"),
      pool.query("SELECT nombre FROM escuelas ORDER BY nombre"),
    ]);

    res.json({
      municipios:    municipios.rows.map(r => r.nombre),
      categorias:    categorias.rows.map(r => r.nombre),
      subcategorias: subcategorias.rows.map(r => r.nombre),
      escuelas:      escuelas.rows.map(r => r.nombre),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});