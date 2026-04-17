import "./loadEnv.js";
import jwt from "jsonwebtoken";
import multer from "multer";
import XLSX from "xlsx-js-style";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const upload = multer({ storage: multer.memoryStorage() });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SECRET = process.env.JWT_SECRET || "supersecretkey";

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
 
/* ══════════════════════════════════════════════════════════════
   VALIDACIÓN BASE DE FORMULARIOS
   ══════════════════════════════════════════════════════════════
   Esta función valida los campos mínimos compartidos por:
   - /api/contacto
   - /api/solicitud-material

   Reglas:
   - nombre_completo y telefono son obligatorios
   - aviso_privacidad_aceptado debe venir en true
   - si correo viene lleno, debe tener formato válido
   ══════════════════════════════════════════════════════════════ */
function validarFormularioBase(body) {
  const {
    nombre_completo,
    correo,
    telefono,
    aviso_privacidad_aceptado
  } = body;

  if (!nombre_completo || !telefono) {
    return "Nombre completo y teléfono son obligatorios.";
  }

  if (!aviso_privacidad_aceptado) {
    return "Debes aceptar el aviso de privacidad.";
  }

  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return "Correo electrónico inválido.";
  }

  return null;
}

/* ══════════════════════════════════════════════════════════════
   /api/contacto
   Guarda el formulario de la página de contacto.
   ══════════════════════════════════════════════════════════════
   Body esperado:
   {
     "nombre_completo": "Juan Pérez",
     "tipo_instancia": "Empresa",
     "nombre_instancia": "Mi Empresa SA",
     "correo": "correo@ejemplo.com",
     "telefono": "3312345678",
     "mensaje": "Quiero apoyar",
     "aviso_privacidad_aceptado": true
   }

   Se guarda en la tabla solicitudes_donacion con:
   origen_formulario = 'contacto'
   ══════════════════════════════════════════════════════════════ */
app.post("/api/contacto", async (req, res) => {
  try {
    const error = validarFormularioBase(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const {
      nombre_completo,
      tipo_instancia,
      nombre_instancia,
      correo,
      telefono,
      mensaje,
      aviso_privacidad_aceptado
    } = req.body;

    const result = await pool.query(
      `INSERT INTO solicitudes_donacion (
         nombre_completo,
         tipo_instancia,
         nombre_instancia,
         correo,
         telefono,
         mensaje,
         origen_formulario,
         aviso_privacidad_aceptado
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'contacto', $7)
       RETURNING id`,
      [
        nombre_completo,
        tipo_instancia || null,
        nombre_instancia || null,
        correo || null,
        telefono,
        mensaje || null,
        aviso_privacidad_aceptado
      ]
    );

    res.status(201).json({
      message: "Formulario de contacto guardado correctamente.",
      solicitud_id: result.rows[0].id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar el formulario de contacto." });
  }
});

/* ══════════════════════════════════════════════════════════════
   /api/solicitud-material
   Guarda el formulario de "Siguientes Pasos" junto con los
   materiales que vienen del carrito de filtrado.
   ══════════════════════════════════════════════════════════════
   Body esperado:
   {
     "nombre_completo": "Juan Pérez",
     "tipo_instancia": "Empresa",
     "nombre_instancia": "Mi Empresa SA",
     "correo": "correo@ejemplo.com",
     "telefono": "3312345678",
     "mensaje": "Puedo entregar la próxima semana",
     "aviso_privacidad_aceptado": true,
     "materiales": [
       {
         "id": 15,
         "escuela": "Primaria Benito Juárez",
         "propuesta": "Cuadernos profesionales",
         "cantidad": 10,
         "unidad": "piezas"
       }
     ]
   }

   Flujo:
   1) Inserta el formulario en solicitudes_donacion
      con origen_formulario = 'pasos'
   2) Obtiene el id de esa solicitud
   3) Inserta cada material del carrito en solicitud_materiales
      relacionándolo con solicitud_id
   4) Todo se hace dentro de una transacción
   ══════════════════════════════════════════════════════════════ */
app.post("/api/solicitud-material", async (req, res) => {
  const client = await pool.connect();

  try {
    const error = validarFormularioBase(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const {
      nombre_completo,
      tipo_instancia,
      nombre_instancia,
      correo,
      telefono,
      mensaje,
      aviso_privacidad_aceptado,
      materiales
    } = req.body;

    if (!Array.isArray(materiales) || materiales.length === 0) {
      return res.status(400).json({
        error: "Debes enviar al menos un material del carrito."
      });
    }

    await client.query("BEGIN");

    const solicitudResult = await client.query(
      `INSERT INTO solicitudes_donacion (
         nombre_completo,
         tipo_instancia,
         nombre_instancia,
         correo,
         telefono,
         mensaje,
         origen_formulario,
         aviso_privacidad_aceptado
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pasos', $7)
       RETURNING id`,
      [
        nombre_completo,
        tipo_instancia || null,
        nombre_instancia || null,
        correo || null,
        telefono,
        mensaje || null,
        aviso_privacidad_aceptado
      ]
    );

    const solicitudId = solicitudResult.rows[0].id;

    for (const item of materiales) {
      await client.query(
        `INSERT INTO solicitud_materiales (
           solicitud_id,
           necesidad_id,
           escuela,
           propuesta,
           cantidad,
           unidad
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          solicitudId,
          item.id || null,
          item.escuela || null,
          item.propuesta,
          item.cantidad,
          item.unidad || null
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Solicitud y materiales guardados correctamente.",
      solicitud_id: solicitudId
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Error al guardar la solicitud de materiales." });
  } finally {
    client.release();
  }
});

/* ══════════════════════════════════════════════════════════
   ██  ENDPOINTS ADMIN (CRUD DE NECESIDADES)
   ══════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════
   GET /api/admin/necesidades
   Consulta de necesidades para el panel admin.
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/necesidades", async (req, res) => {
  try {
    const { municipio, escuela, categoria_id, subcategoria_id, busqueda } = req.query;

    if (!municipio && !escuela && !categoria_id && !subcategoria_id && !busqueda) {
      return res.json({ data: [] });
    }

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
   ══════════════════════════════════════════════════════════ */
app.post("/api/admin/necesidades", async (req, res) => {
  try {
    const {
      escuela,
      municipio,
      subcategoria_id,
      propuesta,
      cantidad,
      unidad,
      estado,
      detalles
    } = req.body;

    if (!escuela || !municipio || !subcategoria_id || !propuesta || cantidad == null || !unidad) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

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

    // Insertar necesidad
    const result = await pool.query(
      `INSERT INTO necesidades (escuela_id, subcategoria_id, propuesta, cantidad, unidad, estado, detalles)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [escuelaId, subcategoria_id, propuesta, cantidad, unidad, estado || 'Pendiente', detalles || null]
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
   ══════════════════════════════════════════════════════════ */
app.put("/api/admin/necesidades/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      escuela,
      municipio,
      subcategoria_id,
      propuesta,
      cantidad,
      unidad,
      estado,
      detalles
    } = req.body;

    const existe = await pool.query("SELECT id FROM necesidades WHERE id = $1", [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: "Necesidad no encontrada" });
    }

    let escuelaId = null;

    if (escuela && municipio) {
      let munResult = await pool.query("SELECT id FROM municipios WHERE nombre = $1", [municipio]);
      let municipioId;
      if (munResult.rows.length > 0) {
        municipioId = munResult.rows[0].id;
      } else {
        const newMun = await pool.query("INSERT INTO municipios (nombre) VALUES ($1) RETURNING id", [municipio]);
        municipioId = newMun.rows[0].id;
      }

      let escResult = await pool.query("SELECT id FROM escuelas WHERE nombre = $1", [escuela]);
      if (escResult.rows.length > 0) {
        escuelaId = escResult.rows[0].id;
        await pool.query("UPDATE escuelas SET municipio_id = $1 WHERE id = $2", [municipioId, escuelaId]);
      } else {
        const newEsc = await pool.query(
          "INSERT INTO escuelas (nombre, municipio_id) VALUES ($1, $2) RETURNING id",
          [escuela, municipioId]
        );
        escuelaId = newEsc.rows[0].id;
      }
    }

    const sets = [];
    const values = [];

    if (escuelaId) {
      values.push(escuelaId);
      sets.push(`escuela_id = $${values.length}`);
    }
    if (subcategoria_id) {
      values.push(subcategoria_id);
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
   GET /api/admin/categorias-reales
   Categorías y subcategorías REALES (para el Create).
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/categorias-reales", async (req, res) => {
  try {
    const [categorias, subcategorias] = await Promise.all([
      pool.query("SELECT id, nombre FROM categorias ORDER BY nombre"),
      pool.query("SELECT id, nombre, categoria_id FROM subcategorias ORDER BY nombre"),
    ]);

    res.json({
      categorias: categorias.rows,
      subcategorias: subcategorias.rows,
    });
  } catch (err) {
    console.error("Error en GET /api/admin/categorias-reales:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   GET /api/admin/escuelas/buscar?q=texto
   Autocompletado de escuelas.
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
   Autocompletado de municipios.
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/municipios/buscar", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ data: [] });
    }

    const result = await pool.query(
      `SELECT nombre FROM municipios
       WHERE nombre ILIKE $1
       ORDER BY nombre
       LIMIT 10`,
      [`%${q}%`]
    );

    res.json({ data: result.rows.map(r => r.nombre) });
  } catch (err) {
    console.error("Error en GET /api/admin/municipios/buscar:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/admin/excel/info
   Devuelve metadata rápida para mostrar en el panel de sync:
   - total de registros en la BD
   - ID del registro más reciente (proxy de "última actualización")
   Se usa para mostrar el texto "Última actualización en sistema".
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/excel/info", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) AS total, MAX(id) AS ultimo_id FROM necesidades"
    );
    res.json({
      total:    parseInt(result.rows[0].total),
      ultimoId: result.rows[0].ultimo_id
    });
  } catch (err) {
    console.error("Error en GET /api/admin/excel/info:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   GET /api/admin/excel/descargar
   Genera un archivo .xlsx en memoria con TODOS los registros
   de la BD y lo envía como descarga.
   
   Las columnas son exactamente las mismas que el Excel original
   (mismo nombre, mismo orden) para que el admin pueda editarlo
   y volver a subirlo sin problemas de formato.
   
   Usa la librería xlsx (ya instalada) para construir el archivo
   en buffer — nunca se escribe en disco.
   ══════════════════════════════════════════════════════════ */
app.get("/api/admin/excel/descargar", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         m.nombre  AS "Municipio",
         c.nombre  AS "Categoría",
         s.nombre  AS "Subcategoría",
         e.nombre  AS "Escuela",
         n.propuesta AS "Propuesta",
         n.cantidad  AS "Cantidad",
         n.unidad    AS "Unidad",
         n.detalles  AS "Detalles",
         n.estado    AS "Estado"
       FROM necesidades n
       JOIN escuelas      e ON n.escuela_id      = e.id
       JOIN municipios    m ON e.municipio_id    = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias    c ON s.categoria_id    = c.id
       ORDER BY m.nombre, e.nombre, n.id`
    );

    const wb = XLSX.utils.book_new();

    const headers = [
      "Municipio",
      "Categoría",
      "Subcategoría",
      "Escuela",
      "Propuesta",
      "Cantidad",
      "Unidad",
      "Detalles",
      "Estado"
    ];

    const data = result.rows.map(r => [
      r.Municipio,
      r.Categoría,
      r.Subcategoría,
      r.Escuela,
      r.Propuesta,
      r.Cantidad,
      r.Unidad,
      r.Detalles,
      r.Estado
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    // 📌 Rango de la hoja
    const range = XLSX.utils.decode_range(ws["!ref"]);

    // 🎨 Estilo encabezados
    const headerStyle = {
      fill: {
        fgColor: { rgb: "259D63" }
      },
      font: {
        color: { rgb: "FFFFFF" },
        bold: true,
        name: "Montserrat"
      },
      alignment: {
        horizontal: "center",
        vertical: "center"
      }
    };

    // 🎨 Estilo general (todas las celdas)
    const cellStyle = {
      font: {
        name: "Montserrat"
      }
    };

    // Aplicar estilos
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });

        if (!ws[cellAddress]) continue;

        // Encabezados (fila 0)
        if (R === 0) {
          ws[cellAddress].s = headerStyle;
        } else {
          ws[cellAddress].s = cellStyle;
        }
      }
    }

    // Ancho de columnas
    ws["!cols"] = [
      { wch: 20 },
      { wch: 20 },
      { wch: 25 },
      { wch: 30 },
      { wch: 35 },
      { wch: 10 },
      { wch: 15 },
      { wch: 40 },
      { wch: 20 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Necesidades");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="necesidades_${fecha}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);

  } catch (err) {
    console.error("Error en GET /api/admin/excel/descargar:", err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


/* ══════════════════════════════════════════════════════════
   POST /api/admin/excel/subir
   Recibe un archivo .xlsx, lo procesa fila por fila y agrega
   las necesidades a la BD usando la misma lógica de upsert
   que el script de importación original.
   
   NO borra registros existentes — solo agrega los nuevos.
   Si una combinación de datos ya existe exactamente igual,
   se insertará de todos modos (la BD no tiene UNIQUE en necesidades).
   
   Usa multer con memoryStorage: el archivo llega en req.file.buffer.
   Columnas esperadas (insensible a mayúsculas):
     Municipio, Categoría, Subcategoría, Escuela,
     Propuesta, Cantidad, Unidad, Detalles, Estado
   ══════════════════════════════════════════════════════════ */
app.post("/api/admin/excel/subir", upload.single("archivo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ningún archivo" });
  }

  try {
    // Leer el buffer del archivo
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const filas    = XLSX.utils.sheet_to_json(sheet);

    if (filas.length === 0) {
      return res.status(400).json({ error: "El archivo no contiene datos" });
    }

    const clean = (val) => (val ? String(val).trim() : null);
    const normalizeEstado = (estado) => {
      if (!estado) return "Aun no cubierto";

      const val = String(estado).toLowerCase().trim();

      if (val === "cubierto") return "Cubierto";
      if (val === "cubierto parcialmente") return "Cubierto parcialmente";
      if (val === "aun no cubierto" || val === "aún no cubierto") return "Aun no cubierto";

      // fallback seguro
      return "Aun no cubierto";
    };

    const client = await pool.connect();
    let insertados = 0;
    let omitidos   = 0;

    try {
      if (filas.length < 5) {
        return res.status(400).json({
          error: "El archivo parece incompleto. Operación cancelada."
        });
      }

      await client.query("BEGIN");

      // ⚠️ BORRAR TODO ANTES DE INSERTAR
      await client.query("TRUNCATE TABLE necesidades RESTART IDENTITY CASCADE");

      for (const fila of filas) {
        const municipio   = clean(fila["Municipio"]);
        const categoria   = clean(fila["Categoría"] || fila["Categoria"]);
        const subcategoria = clean(fila["Subcategoría"] || fila["Subcategoria"]);
        const escuela     = clean(fila["Escuela"]);
        const propuesta   = clean(fila["Propuesta"]);
        const cantidad    = parseInt(fila["Cantidad"]) || 1;
        const unidad      = clean(fila["Unidad"]);
        const detalles    = clean(fila["Detalles"]);
        const estado      = normalizeEstado(fila["Estado"]);

        // Omitir filas incompletas
        if (!municipio || !categoria || !subcategoria || !escuela || !propuesta) {
          omitidos++;
          continue;
        }

        // Buscar o crear municipio
        let munRes = await client.query(
          "SELECT id FROM municipios WHERE nombre = $1", [municipio]
        );
        let municipioId = munRes.rows.length > 0
          ? munRes.rows[0].id
          : (await client.query("INSERT INTO municipios (nombre) VALUES ($1) RETURNING id", [municipio])).rows[0].id;

        // Buscar o crear categoría
        let catRes = await client.query(
          "SELECT id FROM categorias WHERE nombre = $1", [categoria]
        );
        let categoriaId = catRes.rows.length > 0
          ? catRes.rows[0].id
          : (await client.query("INSERT INTO categorias (nombre) VALUES ($1) RETURNING id", [categoria])).rows[0].id;

        // Buscar o crear subcategoría
        let subRes = await client.query(
          "SELECT id FROM subcategorias WHERE nombre = $1 AND categoria_id = $2",
          [subcategoria, categoriaId]
        );
        let subcategoriaId = subRes.rows.length > 0
          ? subRes.rows[0].id
          : (await client.query("INSERT INTO subcategorias (nombre, categoria_id) VALUES ($1, $2) RETURNING id", [subcategoria, categoriaId])).rows[0].id;

        // Buscar o crear escuela
        let escRes = await client.query(
          "SELECT id FROM escuelas WHERE nombre = $1", [escuela]
        );
        let escuelaId = escRes.rows.length > 0
          ? escRes.rows[0].id
          : (await client.query("INSERT INTO escuelas (nombre, municipio_id) VALUES ($1, $2) RETURNING id", [escuela, municipioId])).rows[0].id;

        // Insertar necesidad
        await client.query(
          `INSERT INTO necesidades (escuela_id, subcategoria_id, propuesta, cantidad, unidad, estado, detalles)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [escuelaId, subcategoriaId, propuesta, cantidad, unidad, estado, detalles]
        );

        insertados++;
      }

      await client.query("COMMIT");
      res.json({
        message:    `Importación completada: ${insertados} registros insertados, ${omitidos} omitidos por datos incompletos.`,
        insertados,
        omitidos
      });

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error("Error en POST /api/admin/excel/subir:", err);
    res.status(500).json({ error: "Error procesando el archivo: " + err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   AUTH — REGISTRO DONADOR
   ══════════════════════════════════════════════════════════ */
app.post("/api/auth/register-donador", async (req, res) => {
  try {
    const { nombre_completo, correo, password, fecha_nacimiento, estado } = req.body;

    if (!nombre_completo || !correo || !password)
      return res.status(400).json({ error: "Nombre, correo y contraseña son requeridos." });

    const existe = await pool.query("SELECT id FROM donadores WHERE correo = $1", [correo]);
    if (existe.rows.length > 0)
      return res.status(400).json({ error: "Ya existe una cuenta con ese correo." });

    await pool.query(
      `INSERT INTO donadores (nombre_completo, correo, password_hash, fecha_nacimiento, estado)
       VALUES ($1, $2, $3, $4, $5)`,
      [nombre_completo, correo, password, fecha_nacimiento || null, estado || null]
    );

    res.status(201).json({ message: "Cuenta creada exitosamente." });
  } catch (err) {
    console.error("Error en register-donador:", err);
    res.status(500).json({ error: "Error en servidor." });
  }
});

/* ══════════════════════════════════════════════════════════
   AUTH — LOGIN DONADOR
   ══════════════════════════════════════════════════════════ */
app.post("/api/auth/login-donador", async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password)
      return res.status(400).json({ error: "Completa todos los campos." });

    const porCorreo = await pool.query(
      "SELECT * FROM donadores WHERE correo = $1", [correo]
    );
    if (porCorreo.rows.length === 0)
      return res.status(401).json({ error: "No existe una cuenta con ese correo." });

    const user = porCorreo.rows[0];
    if (user.password_hash !== password)
      return res.status(401).json({ error: "Contraseña incorrecta." });

    const token = jwt.sign(
      { id: user.id, correo: user.correo, rol: "donador", nombre: user.nombre_completo },
      SECRET,
      { expiresIn: "2h" }
    );

    res.json({ message: "Bienvenido", token, rol: "donador", nombre: user.nombre_completo, correo: user.correo })
  } catch (err) {
    console.error("Error en login-donador:", err);
    res.status(500).json({ error: "Error en servidor." });
  }
});

/* ══════════════════════════════════════════════════════════
   AUTH — LOGIN ADMIN
   ══════════════════════════════════════════════════════════ */
app.post("/api/auth/login-admin", async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password)
      return res.status(400).json({ error: "Completa todos los campos." });

    const porCorreo = await pool.query(
      "SELECT * FROM administradores WHERE correo = $1", [correo]
    );
    if (porCorreo.rows.length === 0)
      return res.status(401).json({ error: "No existe un administrador con ese correo." });

    const user = porCorreo.rows[0];
    if (user.password_hash !== password)
      return res.status(401).json({ error: "Contraseña incorrecta." });

    const token = jwt.sign(
      { id: user.id, correo: user.correo, rol: "admin", nombre: user.nombre },
      SECRET,
      { expiresIn: "4h" }
    );

    res.json({ message: "Acceso concedido", token, rol: "admin" });
  } catch (err) {
    console.error("Error en login-admin:", err);
    res.status(500).json({ error: "Error en servidor." });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});