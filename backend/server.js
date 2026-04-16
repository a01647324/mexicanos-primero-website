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
app.use(express.static(path.join(__dirname, "..")));

// ── TEST ──────────────────────────────────────────────────
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend funcionando 🚀" });
});


/* ══════════════════════════════════════════════════════════
   ██  ENDPOINTS PÚBLICOS (CATÁLOGO + FILTRADO)
   ══════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════
   /api/catalogo
   Devuelve todas las categorías del catálogo visual
   (las tarjetas grandes de catalogo.html)
   con su mapeo a la categoría real de la BD.
   ══════════════════════════════════════════════════════════ */
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
 
/* ══════════════════════════════════════════════════════════
   /api/catalogo/:id/subcategorias
   Devuelve las subcategorías visuales de una categoría catálogo.
   Ej: /api/catalogo/3/subcategorias → cards de deportivo.html
   Incluye el mapeo a subcategoria_real y categoria_real para
   que el frontend sepa qué filtros pre-seleccionar.
   ══════════════════════════════════════════════════════════ */
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
 
/* ══════════════════════════════════════════════════════════
   /api/filtros
   Devuelve las opciones para los <select> de filtrado.html.
 
   CAMBIO CLAVE respecto a la versión anterior:
   - categorias    → ahora viene de categorias_catalogo (lo que el
                     usuario ve: "Material didáctico", "Salud", etc.)
   - subcategorias → ahora viene de subcategorias_catalogo
   - municipios y escuelas siguen igual (tablas reales)
 
   El frontend mostrará los nombres del catálogo visual, pero
   al hacer la query real usaremos los IDs reales mapeados.
   ══════════════════════════════════════════════════════════ */
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
 
/* ══════════════════════════════════════════════════════════
   /api/data  — Filtrado inteligente
   ══════════════════════════════════════════════════════════
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
   ══════════════════════════════════════════════════════════ */
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


/* ══════════════════════════════════════════════════════════
   ██  ENDPOINTS ADMIN (CRUD DE NECESIDADES)
   ══════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════
   GET /api/admin/necesidades
   Consulta de necesidades para el panel admin.
   Usa los mismos filtros de catálogo que /api/data.
   La diferencia: incluye el campo "detalles" y devuelve
   los IDs reales de las tablas para poder editar/eliminar.
   
   También acepta ?busqueda=texto para buscar por nombre
   de escuela (ILIKE = insensible a mayúsculas/minúsculas).
   
   NO devuelve datos si no se envía al menos un filtro
   (para evitar cargar miles de registros de golpe).
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/necesidades", async (req, res) => {
  try {
    const { municipio, escuela, categoria_id, subcategoria_id, busqueda } = req.query;

    // Verificar que venga al menos un filtro
    if (!municipio && !escuela && !categoria_id && !subcategoria_id && !busqueda) {
      return res.json({ data: [] });
    }

    // Traducir IDs de catálogo a IDs reales (misma lógica que /api/data)
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

    // Construir WHERE dinámico
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
    if (busqueda) {
      values.push(`%${busqueda}%`);
      conditions.push(`e.nombre ILIKE $${values.length}`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await pool.query(
      `SELECT
         n.id               AS "id",
         n.escuela_id       AS "escuela_id",
         n.subcategoria_id  AS "subcategoria_id",
         e.nombre           AS "Escuela",
         e.municipio_id     AS "municipio_id",
         m.nombre           AS "Municipio",
         c.id               AS "categoria_id",
         c.nombre           AS "Categoría",
         s.nombre           AS "Subcategoría",
         n.propuesta        AS "Propuesta",
         n.cantidad         AS "Cantidad",
         n.unidad           AS "Unidad",
         n.estado           AS "Estado",
         n.detalles         AS "Detalles"
       FROM necesidades n
       JOIN escuelas      e ON n.escuela_id     = e.id
       JOIN municipios    m ON e.municipio_id   = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias    c ON s.categoria_id   = c.id
       ${whereClause}
       ORDER BY e.nombre, n.id`,
      values
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error("Error en GET /api/admin/necesidades:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   GET /api/admin/necesidades/:id
   Detalle completo de UNA necesidad (para el modal).
   Incluye todos los campos y los IDs reales.
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/necesidades/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         n.id               AS "id",
         n.escuela_id       AS "escuela_id",
         n.subcategoria_id  AS "subcategoria_id",
         e.nombre           AS "Escuela",
         e.municipio_id     AS "municipio_id",
         m.nombre           AS "Municipio",
         c.id               AS "categoria_id",
         c.nombre           AS "Categoría",
         s.nombre           AS "Subcategoría",
         n.propuesta        AS "Propuesta",
         n.cantidad         AS "Cantidad",
         n.unidad           AS "Unidad",
         n.estado           AS "Estado",
         n.detalles         AS "Detalles"
       FROM necesidades n
       JOIN escuelas      e ON n.escuela_id     = e.id
       JOIN municipios    m ON e.municipio_id   = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias    c ON s.categoria_id   = c.id
       WHERE n.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Necesidad no encontrada" });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error("Error en GET /api/admin/necesidades/:id:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   POST /api/admin/necesidades
   Crear una nueva necesidad.
   
   Recibe en el body:
   {
     "escuela":      "Escuela Primaria Benito Juárez",
     "municipio":    "Zapopan",
     "categoria":    "Infraestructura",
     "subcategoria": "Pizarrones / pintarrones",
     "propuesta":    "Se necesitan 5 pizarrones nuevos",
     "cantidad":     5,
     "unidad":       "piezas",
     "estado":       "Pendiente",
     "detalles":     "Texto opcional"
   }
   
   Si la escuela, municipio, categoría o subcategoría no 
   existen, se crean automáticamente.
   ══════════════════════════════════════════════════════════ */
app.post("/api/admin/necesidades", async (req, res) => {
  try {
    const { escuela, municipio, categoria, subcategoria, propuesta, cantidad, unidad, estado, detalles } = req.body;

    // Validación básica
    if (!escuela || !municipio || !categoria || !subcategoria || !propuesta || cantidad == null || !unidad) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // 1. Buscar o crear municipio
    let munResult = await pool.query("SELECT id FROM municipios WHERE nombre = $1", [municipio]);
    let municipioId;
    if (munResult.rows.length > 0) {
      municipioId = munResult.rows[0].id;
    } else {
      const newMun = await pool.query("INSERT INTO municipios (nombre) VALUES ($1) RETURNING id", [municipio]);
      municipioId = newMun.rows[0].id;
    }

    // 2. Buscar o crear escuela (vinculada al municipio)
    let escResult = await pool.query("SELECT id FROM escuelas WHERE nombre = $1", [escuela]);
    let escuelaId;
    if (escResult.rows.length > 0) {
      escuelaId = escResult.rows[0].id;
    } else {
      const newEsc = await pool.query(
        "INSERT INTO escuelas (nombre, municipio_id) VALUES ($1, $2) RETURNING id",
        [escuela, municipioId]
      );
      escuelaId = newEsc.rows[0].id;
    }

    // 3. Buscar o crear categoría (real)
    let catResult = await pool.query("SELECT id FROM categorias WHERE nombre = $1", [categoria]);
    let categoriaId;
    if (catResult.rows.length > 0) {
      categoriaId = catResult.rows[0].id;
    } else {
      const newCat = await pool.query("INSERT INTO categorias (nombre) VALUES ($1) RETURNING id", [categoria]);
      categoriaId = newCat.rows[0].id;
    }

    // 4. Buscar o crear subcategoría (real, vinculada a categoría)
    let subResult = await pool.query(
      "SELECT id FROM subcategorias WHERE nombre = $1 AND categoria_id = $2",
      [subcategoria, categoriaId]
    );
    let subcategoriaId;
    if (subResult.rows.length > 0) {
      subcategoriaId = subResult.rows[0].id;
    } else {
      const newSub = await pool.query(
        "INSERT INTO subcategorias (nombre, categoria_id) VALUES ($1, $2) RETURNING id",
        [subcategoria, categoriaId]
      );
      subcategoriaId = newSub.rows[0].id;
    }

    // 5. Insertar la necesidad
    const result = await pool.query(
      `INSERT INTO necesidades (escuela_id, subcategoria_id, propuesta, cantidad, unidad, estado, detalles)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [escuelaId, subcategoriaId, propuesta, cantidad, unidad, estado || 'Pendiente', detalles || null]
    );

    res.status(201).json({ id: result.rows[0].id, message: "Necesidad creada exitosamente" });
  } catch (err) {
    console.error("Error en POST /api/admin/necesidades:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   PUT /api/admin/necesidades/:id
   Actualizar una necesidad existente.
   
   Recibe en el body los mismos campos que POST.
   Solo actualiza los campos que vengan.
   Si se cambia el nombre de escuela/municipio/categoría/
   subcategoría, busca o crea el nuevo registro.
   ══════════════════════════════════════════════════════════ */
app.put("/api/admin/necesidades/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { escuela, municipio, categoria, subcategoria, propuesta, cantidad, unidad, estado, detalles } = req.body;

    // Verificar que la necesidad existe
    const existe = await pool.query("SELECT id FROM necesidades WHERE id = $1", [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: "Necesidad no encontrada" });
    }

    // Resolver IDs (misma lógica que POST: buscar o crear)
    let escuelaId = null;
    let subcategoriaId = null;

    if (escuela && municipio) {
      // Buscar o crear municipio
      let munResult = await pool.query("SELECT id FROM municipios WHERE nombre = $1", [municipio]);
      let municipioId;
      if (munResult.rows.length > 0) {
        municipioId = munResult.rows[0].id;
      } else {
        const newMun = await pool.query("INSERT INTO municipios (nombre) VALUES ($1) RETURNING id", [municipio]);
        municipioId = newMun.rows[0].id;
      }

      // Buscar o crear escuela
      let escResult = await pool.query("SELECT id FROM escuelas WHERE nombre = $1", [escuela]);
      if (escResult.rows.length > 0) {
        escuelaId = escResult.rows[0].id;
        // Actualizar municipio de la escuela si cambió
        await pool.query("UPDATE escuelas SET municipio_id = $1 WHERE id = $2", [municipioId, escuelaId]);
      } else {
        const newEsc = await pool.query(
          "INSERT INTO escuelas (nombre, municipio_id) VALUES ($1, $2) RETURNING id",
          [escuela, municipioId]
        );
        escuelaId = newEsc.rows[0].id;
      }
    }

    if (categoria && subcategoria) {
      // Buscar o crear categoría
      let catResult = await pool.query("SELECT id FROM categorias WHERE nombre = $1", [categoria]);
      let categoriaId;
      if (catResult.rows.length > 0) {
        categoriaId = catResult.rows[0].id;
      } else {
        const newCat = await pool.query("INSERT INTO categorias (nombre) VALUES ($1) RETURNING id", [categoria]);
        categoriaId = newCat.rows[0].id;
      }

      // Buscar o crear subcategoría
      let subResult = await pool.query(
        "SELECT id FROM subcategorias WHERE nombre = $1 AND categoria_id = $2",
        [subcategoria, categoriaId]
      );
      if (subResult.rows.length > 0) {
        subcategoriaId = subResult.rows[0].id;
      } else {
        const newSub = await pool.query(
          "INSERT INTO subcategorias (nombre, categoria_id) VALUES ($1, $2) RETURNING id",
          [subcategoria, categoriaId]
        );
        subcategoriaId = newSub.rows[0].id;
      }
    }

    // Construir UPDATE dinámico (solo los campos que cambiaron)
    const sets = [];
    const values = [];

    if (escuelaId) {
      values.push(escuelaId);
      sets.push(`escuela_id = $${values.length}`);
    }
    if (subcategoriaId) {
      values.push(subcategoriaId);
      sets.push(`subcategoria_id = $${values.length}`);
    }
    if (propuesta !== undefined) {
      values.push(propuesta);
      sets.push(`propuesta = $${values.length}`);
    }
    if (cantidad !== undefined) {
      values.push(cantidad);
      sets.push(`cantidad = $${values.length}`);
    }
    if (unidad !== undefined) {
      values.push(unidad);
      sets.push(`unidad = $${values.length}`);
    }
    if (estado !== undefined) {
      values.push(estado);
      sets.push(`estado = $${values.length}`);
    }
    if (detalles !== undefined) {
      values.push(detalles);
      sets.push(`detalles = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No se enviaron campos para actualizar" });
    }

    values.push(id);
    await pool.query(
      `UPDATE necesidades SET ${sets.join(", ")} WHERE id = $${values.length}`,
      values
    );

    res.json({ message: "Necesidad actualizada exitosamente" });
  } catch (err) {
    console.error("Error en PUT /api/admin/necesidades/:id:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   DELETE /api/admin/necesidades/:id
   Eliminar una necesidad de la base de datos.
   Eliminación real (no soft delete).
   ══════════════════════════════════════════════════════════ */
app.delete("/api/admin/necesidades/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM necesidades WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Necesidad no encontrada" });
    }

    res.json({ message: "Necesidad eliminada exitosamente" });
  } catch (err) {
    console.error("Error en DELETE /api/admin/necesidades/:id:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   GET /api/admin/escuelas/buscar?q=texto
   Autocompletado de nombres de escuelas.
   Devuelve hasta 10 coincidencias parciales.
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/escuelas/buscar", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ data: [] });
    }

    const result = await pool.query(
      `SELECT nombre FROM escuelas
       WHERE nombre ILIKE $1
       ORDER BY nombre
       LIMIT 10`,
      [`%${q}%`]
    );

    res.json({ data: result.rows.map(r => r.nombre) });
  } catch (err) {
    console.error("Error en GET /api/admin/escuelas/buscar:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/admin/municipios/buscar?q=texto
   Autocompletado de municipios para el formulario CREATE.
   Devuelve hasta 10 coincidencias parciales ordenadas.
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/municipios/buscar", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json({ data: [] });

    const result = await pool.query(
      `SELECT nombre FROM municipios
       WHERE nombre ILIKE $1
       ORDER BY nombre LIMIT 10`,
      [`%${q}%`]
    );
    res.json({ data: result.rows.map(r => r.nombre) });
  } catch (err) {
    console.error("Error en GET /api/admin/municipios/buscar:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   GET /api/admin/categorias-reales
   Devuelve todas las categorías reales (tabla `categorias`)
   con sus subcategorías para poblar los selects del formulario
   CREATE. Son las categorías del excel, no las del catálogo visual.
   Se usan selects (no texto libre) para que el usuario elija
   combinaciones válidas ya existentes en la BD.
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/categorias-reales", async (req, res) => {
  try {
    const [cats, subcats] = await Promise.all([
      pool.query("SELECT id, nombre FROM categorias ORDER BY nombre"),
      pool.query(
        `SELECT s.id, s.nombre, s.categoria_id
         FROM subcategorias s
         ORDER BY s.nombre`
      )
    ]);
    res.json({
      categorias:    cats.rows,
      subcategorias: subcats.rows
    });
  } catch (err) {
    console.error("Error en GET /api/admin/categorias-reales:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});