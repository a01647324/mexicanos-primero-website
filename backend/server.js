import "./loadEnv.js";
import jwt from "jsonwebtoken";
import multer from "multer";
import XLSX from "xlsx-js-style";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const upload   = multer({ storage: multer.memoryStorage() });
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const SECRET     = process.env.JWT_SECRET || "supersecretkey";

console.log("DB URL:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));


// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

// Valida los campos mínimos compartidos por /api/contacto y /api/solicitud-material
function validarFormularioBase(body) {
  const { nombre_completo, correo, telefono, aviso_privacidad_aceptado } = body;
  if (!nombre_completo || !telefono)
    return "Nombre completo y teléfono son obligatorios.";
  if (!aviso_privacidad_aceptado)
    return "Debes aceptar el aviso de privacidad.";
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    return "Correo electrónico inválido.";
  return null;
}


// ─────────────────────────────────────────────────────────────
// TEST
// ─────────────────────────────────────────────────────────────

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend funcionando 🚀" });
});


// ─────────────────────────────────────────────────────────────
// CATÁLOGO PÚBLICO
// ─────────────────────────────────────────────────────────────

// Devuelve todas las categorías del catálogo visual con su mapeo a la BD real
app.get("/api/catalogo", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         cc.id, cc.nombre, cc.imagen, cc.link,
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

// Devuelve las subcategorías visuales de una categoría del catálogo
app.get("/api/catalogo/:id/subcategorias", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         sc.id, sc.nombre, sc.imagen,
         sc.categoria_catalogo_id,
         sc.subcategoria_real_id,
         sc.categoria_real_id,
         c.nombre AS categoria_real_nombre,
         s.nombre AS subcategoria_real_nombre
       FROM subcategorias_catalogo sc
       LEFT JOIN categorias    c ON sc.categoria_real_id    = c.id
       LEFT JOIN subcategorias s ON sc.subcategoria_real_id = s.id
       WHERE sc.categoria_catalogo_id = $1
       ORDER BY sc.id`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Devuelve las opciones para los selects de filtrado (municipios, categorías, subcategorías, escuelas)
// Las categorías y subcategorías vienen de las tablas de catálogo visual, no de las reales
app.get("/api/filtros", async (req, res) => {
  try {
    const [municipios, categorias, subcategorias, escuelas] = await Promise.all([
      pool.query("SELECT nombre FROM municipios ORDER BY nombre"),
      pool.query("SELECT id, nombre, categoria_real_id FROM categorias_catalogo ORDER BY nombre"),
      pool.query(`
        SELECT
          sc.id, sc.nombre,
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
      categorias:    categorias.rows,
      subcategorias: subcategorias.rows,
      escuelas:      escuelas.rows.map(r => r.nombre),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Devuelve necesidades filtradas por municipio, escuela, categoria_id y subcategoria_id
// Los IDs de categoría y subcategoría son del catálogo visual; se traducen a IDs reales internamente
app.get("/api/data", async (req, res) => {
  try {
    const { municipio, escuela, categoria_id, subcategoria_id } = req.query;

    let categoriaRealId    = null;
    let subcategoriaRealId = null;

    if (categoria_id) {
      const r = await pool.query("SELECT categoria_real_id FROM categorias_catalogo WHERE id = $1", [categoria_id]);
      if (r.rows.length > 0) categoriaRealId = r.rows[0].categoria_real_id;
    }
    if (subcategoria_id) {
      const r = await pool.query("SELECT subcategoria_real_id FROM subcategorias_catalogo WHERE id = $1", [subcategoria_id]);
      if (r.rows.length > 0) subcategoriaRealId = r.rows[0].subcategoria_real_id;
    }

    const conditions = [];
    const values     = [];
    if (municipio)         { values.push(municipio);         conditions.push(`m.nombre = $${values.length}`); }
    if (escuela)           { values.push(escuela);           conditions.push(`e.nombre = $${values.length}`); }
    if (categoriaRealId)   { values.push(categoriaRealId);   conditions.push(`c.id = $${values.length}`); }
    if (subcategoriaRealId){ values.push(subcategoriaRealId);conditions.push(`s.id = $${values.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

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
       JOIN escuelas     e ON n.escuela_id     = e.id
       JOIN municipios   m ON e.municipio_id   = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias   c ON s.categoria_id   = c.id
       ${where}
       ORDER BY n.id`,
      values
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


// ─────────────────────────────────────────────────────────────
// FORMULARIOS PÚBLICOS
// ─────────────────────────────────────────────────────────────

// Guarda una solicitud del formulario de contacto (origen: 'contacto')
app.post("/api/contacto", async (req, res) => {
  try {
    const error = validarFormularioBase(req.body);
    if (error) return res.status(400).json({ error });

    const {
      nombre_completo, tipo_instancia, nombre_instancia,
      correo, telefono, mensaje, aviso_privacidad_aceptado, tipo_donacion
    } = req.body;

    const result = await pool.query(
      `INSERT INTO solicitudes_donacion (
         nombre_completo, tipo_instancia, nombre_instancia,
         correo, telefono, mensaje, origen_formulario,
         aviso_privacidad_aceptado, tipo_donacion
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'contacto', $7, $8)
       RETURNING id`,
      [nombre_completo, tipo_instancia||null, nombre_instancia||null,
       correo||null, telefono, mensaje||null, aviso_privacidad_aceptado, tipo_donacion||null]
    );

    res.status(201).json({ message: "Formulario guardado.", solicitud_id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar el formulario." });
  }
});

// Guarda una solicitud de donación material junto con los ítems del carrito (origen: 'pasos')
// Usa una transacción: si falla algún ítem, todo se revierte
app.post("/api/solicitud-material", async (req, res) => {
  const client = await pool.connect();
  try {
    const error = validarFormularioBase(req.body);
    if (error) return res.status(400).json({ error });

    const {
      nombre_completo, tipo_instancia, nombre_instancia,
      correo, telefono, mensaje, aviso_privacidad_aceptado, materiales
    } = req.body;

    if (!Array.isArray(materiales) || materiales.length === 0)
      return res.status(400).json({ error: "Debes enviar al menos un material." });

    await client.query("BEGIN");

    const solicitud = await client.query(
      `INSERT INTO solicitudes_donacion (
         nombre_completo, tipo_instancia, nombre_instancia,
         correo, telefono, mensaje, origen_formulario,
         aviso_privacidad_aceptado, tipo_donacion
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pasos', $7, 'Donación material')
       RETURNING id`,
      [nombre_completo, tipo_instancia||null, nombre_instancia||null,
       correo||null, telefono, mensaje||null, aviso_privacidad_aceptado]
    );

    const solicitudId = solicitud.rows[0].id;

    for (const item of materiales) {
      await client.query(
        `INSERT INTO solicitud_materiales (solicitud_id, necesidad_id, escuela, propuesta, cantidad, unidad)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [solicitudId, item.id||null, item.escuela||null, item.propuesta, item.cantidad, item.unidad||null]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Solicitud guardada.", solicitud_id: solicitudId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Error al guardar la solicitud." });
  } finally {
    client.release();
  }
});


// ─────────────────────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────

// Registra un nuevo donador
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
      [nombre_completo, correo, password, fecha_nacimiento||null, estado||null]
    );
    res.status(201).json({ message: "Cuenta creada exitosamente." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor." });
  }
});

// Login de donador — devuelve JWT con rol 'donador'
app.post("/api/auth/login-donador", async (req, res) => {
  try {
    const { correo, password } = req.body;
    if (!correo || !password)
      return res.status(400).json({ error: "Completa todos los campos." });

    const r = await pool.query("SELECT * FROM donadores WHERE correo = $1", [correo]);
    if (r.rows.length === 0)
      return res.status(401).json({ error: "No existe una cuenta con ese correo." });

    const user = r.rows[0];
    if (user.password_hash !== password)
      return res.status(401).json({ error: "Contraseña incorrecta." });

    const token = jwt.sign(
      { id: user.id, correo: user.correo, rol: "donador", nombre: user.nombre_completo },
      SECRET,
      { expiresIn: "2h" }
    );
    res.json({ message: "Bienvenido", token, rol: "donador", nombre: user.nombre_completo, correo: user.correo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor." });
  }
});

// Login de administrador — devuelve JWT con rol 'admin'
app.post("/api/auth/login-admin", async (req, res) => {
  try {
    const { correo, password } = req.body;
    if (!correo || !password)
      return res.status(400).json({ error: "Completa todos los campos." });

    const r = await pool.query("SELECT * FROM administradores WHERE correo = $1", [correo]);
    if (r.rows.length === 0)
      return res.status(401).json({ error: "No existe un administrador con ese correo." });

    const user = r.rows[0];
    if (user.password_hash !== password)
      return res.status(401).json({ error: "Contraseña incorrecta." });

    const token = jwt.sign(
      { id: user.id, correo: user.correo, rol: "admin", nombre: user.nombre },
      SECRET,
      { expiresIn: "4h" }
    );
    res.json({ message: "Acceso concedido", token, rol: "admin" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor." });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — NECESIDADES
// ─────────────────────────────────────────────────────────────

// Busca necesidades con filtros opcionales (municipio, escuela, categoria, subcategoria, busqueda por texto)
// Requiere al menos un filtro; si no hay ninguno devuelve array vacío
app.get("/api/admin/necesidades", async (req, res) => {
  try {
    const { municipio, escuela, categoria_id, subcategoria_id, busqueda } = req.query;

    if (!municipio && !escuela && !categoria_id && !subcategoria_id && !busqueda)
      return res.json({ data: [] });

    let categoriaRealId    = null;
    let subcategoriaRealId = null;

    if (categoria_id) {
      const r = await pool.query("SELECT categoria_real_id FROM categorias_catalogo WHERE id = $1", [categoria_id]);
      if (r.rows.length > 0) categoriaRealId = r.rows[0].categoria_real_id;
    }
    if (subcategoria_id) {
      const r = await pool.query("SELECT subcategoria_real_id FROM subcategorias_catalogo WHERE id = $1", [subcategoria_id]);
      if (r.rows.length > 0) subcategoriaRealId = r.rows[0].subcategoria_real_id;
    }

    const conditions = [];
    const values     = [];
    if (municipio)         { values.push(municipio);          conditions.push(`m.nombre = $${values.length}`); }
    if (escuela)           { values.push(escuela);            conditions.push(`e.nombre = $${values.length}`); }
    if (categoriaRealId)   { values.push(categoriaRealId);    conditions.push(`c.id = $${values.length}`); }
    if (subcategoriaRealId){ values.push(subcategoriaRealId); conditions.push(`s.id = $${values.length}`); }
    if (busqueda)          { values.push(`%${busqueda}%`);    conditions.push(`e.nombre ILIKE $${values.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
         n.id, n.escuela_id, n.subcategoria_id,
         e.nombre AS "Escuela", e.municipio_id,
         m.nombre AS "Municipio",
         c.id     AS "categoria_id", c.nombre AS "Categoría",
         s.nombre AS "Subcategoría",
         n.propuesta AS "Propuesta", n.cantidad AS "Cantidad",
         n.unidad AS "Unidad", n.estado AS "Estado", n.detalles AS "Detalles"
       FROM necesidades n
       JOIN escuelas      e ON n.escuela_id     = e.id
       JOIN municipios    m ON e.municipio_id   = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias    c ON s.categoria_id   = c.id
       ${where}
       ORDER BY e.nombre, n.id`,
      values
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Devuelve el detalle completo de una necesidad por ID
app.get("/api/admin/necesidades/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         n.id, n.escuela_id, n.subcategoria_id,
         e.nombre AS "Escuela", e.municipio_id,
         m.nombre AS "Municipio",
         c.id     AS "categoria_id", c.nombre AS "Categoría",
         s.nombre AS "Subcategoría",
         n.propuesta AS "Propuesta", n.cantidad AS "Cantidad",
         n.unidad AS "Unidad", n.estado AS "Estado", n.detalles AS "Detalles"
       FROM necesidades n
       JOIN escuelas      e ON n.escuela_id     = e.id
       JOIN municipios    m ON e.municipio_id   = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias    c ON s.categoria_id   = c.id
       WHERE n.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Necesidad no encontrada" });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Crea una nueva necesidad; busca o crea el municipio y la escuela si no existen
app.post("/api/admin/necesidades", async (req, res) => {
  try {
    const { escuela, municipio, subcategoria_id, propuesta, cantidad, unidad, estado, detalles } = req.body;

    if (!escuela || !municipio || !subcategoria_id || !propuesta || cantidad == null || !unidad)
      return res.status(400).json({ error: "Faltan campos obligatorios" });

    let munRes = await pool.query("SELECT id FROM municipios WHERE nombre = $1", [municipio]);
    const municipioId = munRes.rows.length > 0
      ? munRes.rows[0].id
      : (await pool.query("INSERT INTO municipios (nombre) VALUES ($1) RETURNING id", [municipio])).rows[0].id;

    let escRes = await pool.query("SELECT id FROM escuelas WHERE nombre = $1", [escuela]);
    const escuelaId = escRes.rows.length > 0
      ? escRes.rows[0].id
      : (await pool.query("INSERT INTO escuelas (nombre, municipio_id) VALUES ($1, $2) RETURNING id", [escuela, municipioId])).rows[0].id;

    const estadosValidos = ["Cubierto", "Aun no cubierto", "Cubierto parcialmente"];
    const estadoFinal    = estadosValidos.includes(estado) ? estado : "Aun no cubierto";

    const result = await pool.query(
      `INSERT INTO necesidades (escuela_id, subcategoria_id, propuesta, cantidad, unidad, estado, detalles)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [escuelaId, subcategoria_id, propuesta, cantidad, unidad, estadoFinal, detalles||null]
    );
    res.status(201).json({ id: result.rows[0].id, message: "Necesidad creada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Actualiza una necesidad existente; solo modifica los campos que vienen en el body
app.put("/api/admin/necesidades/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { escuela, municipio, subcategoria_id, propuesta, cantidad, unidad, estado, detalles } = req.body;

    const existe = await pool.query("SELECT id FROM necesidades WHERE id = $1", [id]);
    if (existe.rows.length === 0)
      return res.status(404).json({ error: "Necesidad no encontrada" });

    let escuelaId = null;
    if (escuela && municipio) {
      let munRes = await pool.query("SELECT id FROM municipios WHERE nombre = $1", [municipio]);
      const municipioId = munRes.rows.length > 0
        ? munRes.rows[0].id
        : (await pool.query("INSERT INTO municipios (nombre) VALUES ($1) RETURNING id", [municipio])).rows[0].id;

      let escRes = await pool.query("SELECT id FROM escuelas WHERE nombre = $1", [escuela]);
      if (escRes.rows.length > 0) {
        escuelaId = escRes.rows[0].id;
        await pool.query("UPDATE escuelas SET municipio_id = $1 WHERE id = $2", [municipioId, escuelaId]);
      } else {
        escuelaId = (await pool.query("INSERT INTO escuelas (nombre, municipio_id) VALUES ($1, $2) RETURNING id", [escuela, municipioId])).rows[0].id;
      }
    }

    const sets   = [];
    const values = [];
    if (escuelaId)            { values.push(escuelaId);       sets.push(`escuela_id = $${values.length}`); }
    if (subcategoria_id)      { values.push(subcategoria_id); sets.push(`subcategoria_id = $${values.length}`); }
    if (propuesta !== undefined){ values.push(propuesta);     sets.push(`propuesta = $${values.length}`); }
    if (cantidad  !== undefined){ values.push(cantidad);      sets.push(`cantidad = $${values.length}`); }
    if (unidad    !== undefined){ values.push(unidad);        sets.push(`unidad = $${values.length}`); }
    if (estado    !== undefined){ values.push(estado);        sets.push(`estado = $${values.length}`); }
    if (detalles  !== undefined){ values.push(detalles);      sets.push(`detalles = $${values.length}`); }

    if (sets.length === 0)
      return res.status(400).json({ error: "No se enviaron campos para actualizar" });

    values.push(id);
    await pool.query(`UPDATE necesidades SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    res.json({ message: "Necesidad actualizada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Elimina una necesidad por ID
app.delete("/api/admin/necesidades/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM necesidades WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Necesidad no encontrada" });
    res.json({ message: "Necesidad eliminada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Devuelve categorías y subcategorías reales de la BD (no del catálogo visual) para el formulario de crear necesidad
app.get("/api/admin/categorias-reales", async (req, res) => {
  try {
    const [categorias, subcategorias] = await Promise.all([
      pool.query("SELECT id, nombre FROM categorias ORDER BY nombre"),
      pool.query("SELECT id, nombre, categoria_id FROM subcategorias ORDER BY nombre"),
    ]);
    res.json({ categorias: categorias.rows, subcategorias: subcategorias.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Autocompletado de escuelas por texto (mínimo 2 caracteres, máximo 10 resultados)
app.get("/api/admin/escuelas/buscar", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ data: [] });
    const result = await pool.query(
      "SELECT nombre FROM escuelas WHERE nombre ILIKE $1 ORDER BY nombre LIMIT 10",
      [`%${q}%`]
    );
    res.json({ data: result.rows.map(r => r.nombre) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Autocompletado de municipios por texto (mínimo 2 caracteres, máximo 10 resultados)
app.get("/api/admin/municipios/buscar", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ data: [] });
    const result = await pool.query(
      "SELECT nombre FROM municipios WHERE nombre ILIKE $1 ORDER BY nombre LIMIT 10",
      [`%${q}%`]
    );
    res.json({ data: result.rows.map(r => r.nombre) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — EXCEL (NECESIDADES)
// ─────────────────────────────────────────────────────────────

// Devuelve el total de necesidades y el ID más reciente (para el label de última actualización)
app.get("/api/admin/excel/info", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) AS total, MAX(id) AS ultimo_id FROM necesidades");
    res.json({ total: parseInt(result.rows[0].total), ultimoId: result.rows[0].ultimo_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Genera y descarga un archivo .xlsx con todos los registros de necesidades
// El archivo mantiene el mismo formato del Excel original para que pueda re-subirse
app.get("/api/admin/excel/descargar", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         m.nombre  AS "Municipio", c.nombre  AS "Categoría",
         s.nombre  AS "Subcategoría", e.nombre AS "Escuela",
         n.propuesta AS "Propuesta", n.cantidad AS "Cantidad",
         n.unidad AS "Unidad", n.detalles AS "Detalles", n.estado AS "Estado"
       FROM necesidades n
       JOIN escuelas      e ON n.escuela_id      = e.id
       JOIN municipios    m ON e.municipio_id    = m.id
       JOIN subcategorias s ON n.subcategoria_id = s.id
       JOIN categorias    c ON s.categoria_id    = c.id
       ORDER BY m.nombre, e.nombre, n.id`
    );

    const headers = ["Municipio","Categoría","Subcategoría","Escuela","Propuesta","Cantidad","Unidad","Detalles","Estado"];
    const data    = result.rows.map(r => [r.Municipio, r.Categoría, r.Subcategoría, r.Escuela, r.Propuesta, r.Cantidad, r.Unidad, r.Detalles, r.Estado]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const range = XLSX.utils.decode_range(ws["!ref"]);

    const headerStyle = {
      fill: { fgColor: { rgb: "259D63" } },
      font: { color: { rgb: "FFFFFF" }, bold: true, name: "Montserrat" },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const cellStyle = { font: { name: "Montserrat" } };

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = R === 0 ? headerStyle : cellStyle;
      }
    }

    ws["!cols"] = [{ wch:20 },{ wch:20 },{ wch:25 },{ wch:30 },{ wch:35 },{ wch:10 },{ wch:15 },{ wch:40 },{ wch:20 }];
    XLSX.utils.book_append_sheet(wb, ws, "Necesidades");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const fecha  = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="necesidades_${fecha}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Recibe un archivo .xlsx, borra todos los registros actuales de necesidades y los reemplaza con los del archivo
// Columnas esperadas: Municipio, Categoría, Subcategoría, Escuela, Propuesta, Cantidad, Unidad, Detalles, Estado
app.post("/api/admin/excel/subir", upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const filas    = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    if (filas.length === 0)  return res.status(400).json({ error: "El archivo no contiene datos" });
    if (filas.length < 5)    return res.status(400).json({ error: "El archivo parece incompleto. Operación cancelada." });

    const clean = v => v ? String(v).trim() : null;
    const normalizeEstado = v => {
      const s = String(v || "").toLowerCase().trim();
      if (s === "cubierto")                                        return "Cubierto";
      if (s === "cubierto parcialmente")                           return "Cubierto parcialmente";
      if (s === "aun no cubierto" || s === "aún no cubierto")      return "Aun no cubierto";
      return "Aun no cubierto";
    };

    const client = await pool.connect();
    let insertados = 0;
    let omitidos   = 0;

    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE TABLE necesidades RESTART IDENTITY CASCADE");

      for (const fila of filas) {
        const municipio    = clean(fila["Municipio"]);
        const categoria    = clean(fila["Categoría"]    || fila["Categoria"]);
        const subcategoria = clean(fila["Subcategoría"] || fila["Subcategoria"]);
        const escuela      = clean(fila["Escuela"]);
        const propuesta    = clean(fila["Propuesta"]);
        const cantidad     = parseInt(fila["Cantidad"]) || 1;
        const unidad       = clean(fila["Unidad"]);
        const detalles     = clean(fila["Detalles"]);
        const estado       = normalizeEstado(fila["Estado"]);

        if (!municipio || !categoria || !subcategoria || !escuela || !propuesta) {
          omitidos++;
          continue;
        }

        const municipioId = (await client.query("SELECT id FROM municipios WHERE nombre = $1", [municipio])).rows[0]?.id
          ?? (await client.query("INSERT INTO municipios (nombre) VALUES ($1) RETURNING id", [municipio])).rows[0].id;

        const categoriaId = (await client.query("SELECT id FROM categorias WHERE nombre = $1", [categoria])).rows[0]?.id
          ?? (await client.query("INSERT INTO categorias (nombre) VALUES ($1) RETURNING id", [categoria])).rows[0].id;

        const subcategoriaId = (await client.query("SELECT id FROM subcategorias WHERE nombre = $1 AND categoria_id = $2", [subcategoria, categoriaId])).rows[0]?.id
          ?? (await client.query("INSERT INTO subcategorias (nombre, categoria_id) VALUES ($1, $2) RETURNING id", [subcategoria, categoriaId])).rows[0].id;

        const escuelaId = (await client.query("SELECT id FROM escuelas WHERE nombre = $1", [escuela])).rows[0]?.id
          ?? (await client.query("INSERT INTO escuelas (nombre, municipio_id) VALUES ($1, $2) RETURNING id", [escuela, municipioId])).rows[0].id;

        await client.query(
          `INSERT INTO necesidades (escuela_id, subcategoria_id, propuesta, cantidad, unidad, estado, detalles)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [escuelaId, subcategoriaId, propuesta, cantidad, unidad, estado, detalles]
        );
        insertados++;
      }

      await client.query("COMMIT");
      res.json({ message: `Importación completada: ${insertados} insertados, ${omitidos} omitidos.`, insertados, omitidos });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error procesando el archivo: " + err.message });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — BANDEJA DE SOLICITUDES
// ─────────────────────────────────────────────────────────────

// Devuelve todas las solicitudes ordenadas por fecha descendente
app.get("/api/admin/solicitudes", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre_completo, tipo_instancia, nombre_instancia,
              correo, telefono, mensaje, origen_formulario,
              tipo_donacion, estado_lectura, created_at
       FROM solicitudes_donacion
       ORDER BY created_at DESC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Devuelve los materiales asociados a una solicitud de tipo 'pasos'
app.get("/api/admin/solicitudes/:id/materiales", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT escuela, propuesta, cantidad, unidad FROM solicitud_materiales WHERE solicitud_id = $1",
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Actualiza el estado de lectura de una solicitud (nueva / leida / archivada)
app.patch("/api/admin/solicitudes/:id/estado", async (req, res) => {
  try {
    const { estado_lectura } = req.body;
    const validos = ["nueva", "leida", "archivada"];
    if (!validos.includes(estado_lectura))
      return res.status(400).json({ error: "Estado inválido" });
    await pool.query(
      "UPDATE solicitudes_donacion SET estado_lectura = $1 WHERE id = $2",
      [estado_lectura, req.params.id]
    );
    res.json({ message: "Estado actualizado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — GESTIÓN DE SOLICITUDES
// ─────────────────────────────────────────────────────────────

// Devuelve solicitudes paginadas con filtros opcionales y sus materiales como JSON array
app.get("/api/admin/gestion-solicitudes", async (req, res) => {
  try {
    const { busqueda, tipo, estatus, pagina = 1, limite = 15 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    const conditions = [];
    const values     = [];
    if (busqueda) { values.push(`%${busqueda}%`); conditions.push(`(sd.nombre_completo ILIKE $${values.length} OR sd.correo ILIKE $${values.length})`); }
    if (tipo)     { values.push(tipo);             conditions.push(`sd.tipo_donacion = $${values.length}`); }
    if (estatus)  { values.push(estatus);           conditions.push(`sd.estatus_gestion = $${values.length}`); }

    const where    = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const totalRes = await pool.query(`SELECT COUNT(*) FROM solicitudes_donacion sd ${where}`, values);
    const dataRes  = await pool.query(
      `SELECT
         sd.id, sd.nombre_completo, sd.tipo_instancia, sd.nombre_instancia,
         sd.correo, sd.telefono, sd.mensaje, sd.tipo_donacion,
         sd.origen_formulario, sd.estado_lectura, sd.created_at,
         COALESCE(sd.estatus_gestion, 'nueva') AS estatus_gestion,
         COALESCE(sd.notas_admin, '')          AS notas_admin,
         COALESCE(
           json_agg(json_build_object(
             'escuela', sm.escuela, 'propuesta', sm.propuesta,
             'cantidad', sm.cantidad, 'unidad', sm.unidad
           )) FILTER (WHERE sm.id IS NOT NULL),
           '[]'
         ) AS materiales
       FROM solicitudes_donacion sd
       LEFT JOIN solicitud_materiales sm ON sm.solicitud_id = sd.id
       ${where}
       GROUP BY sd.id
       ORDER BY sd.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, parseInt(limite), offset]
    );

    res.json({ data: dataRes.rows, total: parseInt(totalRes.rows[0].count), pagina: parseInt(pagina), limite: parseInt(limite) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Actualiza campos editables de una solicitud (estatus de gestión, notas y datos del solicitante)
app.patch("/api/admin/gestion-solicitudes/:id", async (req, res) => {
  try {
    const { estatus_gestion, notas_admin, nombre_completo, correo, telefono, mensaje } = req.body;
    const sets   = [];
    const values = [];

    if (estatus_gestion !== undefined) {
      const validos = ["nueva", "en_proceso", "pendiente", "finalizada", "cancelada"];
      if (!validos.includes(estatus_gestion))
        return res.status(400).json({ error: "Estatus inválido" });
      values.push(estatus_gestion); sets.push(`estatus_gestion = $${values.length}`);
    }
    if (notas_admin     !== undefined) { values.push(notas_admin);     sets.push(`notas_admin = $${values.length}`); }
    if (nombre_completo !== undefined) { values.push(nombre_completo); sets.push(`nombre_completo = $${values.length}`); }
    if (correo          !== undefined) { values.push(correo);          sets.push(`correo = $${values.length}`); }
    if (telefono        !== undefined) { values.push(telefono);        sets.push(`telefono = $${values.length}`); }
    if (mensaje         !== undefined) { values.push(mensaje);         sets.push(`mensaje = $${values.length}`); }

    if (sets.length === 0) return res.status(400).json({ error: "Nada que actualizar" });

    values.push(req.params.id);
    await pool.query(`UPDATE solicitudes_donacion SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    res.json({ message: "Solicitud actualizada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — PANEL (MÉTRICAS)
// ─────────────────────────────────────────────────────────────

// Devuelve métricas generales para el dashboard: conteos de necesidades, solicitudes, donadores y gráficas
app.get("/api/admin/panel/metricas", async (req, res) => {
  try {
    const [necesidades, solicitudes, donadores, porEstado, porEscuela] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE estado = 'Cubierto')              AS cubiertas,
          COUNT(*) FILTER (WHERE estado = 'Cubierto parcialmente') AS parciales,
          COUNT(*) FILTER (WHERE estado = 'Aun no cubierto')       AS pendientes
        FROM necesidades
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE estado_lectura = 'nueva' OR estado_lectura IS NULL) AS nuevas,
          COUNT(*) FILTER (WHERE estado_lectura = 'leida')     AS leidas,
          COUNT(*) FILTER (WHERE estado_lectura = 'archivada') AS archivadas,
          COUNT(*) FILTER (WHERE tipo_donacion = 'Donación material') AS material,
          COUNT(*) FILTER (WHERE tipo_donacion != 'Donación material' AND tipo_donacion IS NOT NULL) AS otras
        FROM solicitudes_donacion
      `),
      pool.query("SELECT id, nombre_completo, correo, estado, created_at FROM donadores ORDER BY created_at DESC LIMIT 10"),
      pool.query("SELECT estado, COUNT(*) AS total FROM necesidades GROUP BY estado ORDER BY total DESC"),
      pool.query(`
        SELECT e.nombre AS escuela,
          COUNT(*) FILTER (WHERE n.estado = 'Cubierto')              AS cubiertas,
          COUNT(*) FILTER (WHERE n.estado = 'Cubierto parcialmente') AS parciales,
          COUNT(*) FILTER (WHERE n.estado = 'Aun no cubierto')       AS pendientes,
          COUNT(*) AS total
        FROM necesidades n
        JOIN escuelas e ON n.escuela_id = e.id
        GROUP BY e.nombre
        ORDER BY pendientes DESC
        LIMIT 8
      `)
    ]);

    res.json({
      necesidades: necesidades.rows[0],
      solicitudes: solicitudes.rows[0],
      donadores:   donadores.rows,
      porEstado:   porEstado.rows,
      porEscuela:  porEscuela.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — EQUIPO ADMINISTRATIVO
// ─────────────────────────────────────────────────────────────

// Devuelve todos los administradores registrados
app.get("/api/admin/equipo", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, nombre, correo, rol, imagen FROM administradores ORDER BY id");
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Crea un nuevo administrador
app.post("/api/admin/equipo", async (req, res) => {
  try {
    const { nombre, correo, password, rol } = req.body;
    if (!nombre || !correo || !password)
      return res.status(400).json({ error: "Nombre, correo y contraseña son requeridos." });

    const existe = await pool.query("SELECT id FROM administradores WHERE correo = $1", [correo]);
    if (existe.rows.length > 0)
      return res.status(400).json({ error: "Ya existe un administrador con ese correo." });

    const result = await pool.query(
      "INSERT INTO administradores (nombre, correo, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id",
      [nombre, correo, password, rol || "admin"]
    );
    res.status(201).json({ message: "Administrador creado.", id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Actualiza los datos de un administrador (solo los campos que vienen en el body)
app.patch("/api/admin/equipo/:id", async (req, res) => {
  try {
    const { nombre, correo, password, rol } = req.body;
    const sets   = [];
    const values = [];
    if (nombre)   { values.push(nombre);   sets.push(`nombre = $${values.length}`); }
    if (correo)   { values.push(correo);   sets.push(`correo = $${values.length}`); }
    if (password) { values.push(password); sets.push(`password_hash = $${values.length}`); }
    if (rol)      { values.push(rol);      sets.push(`rol = $${values.length}`); }
    if (sets.length === 0) return res.status(400).json({ error: "Nada que actualizar." });
    values.push(req.params.id);
    await pool.query(`UPDATE administradores SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    res.json({ message: "Administrador actualizado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// Elimina un administrador por ID
app.delete("/api/admin/equipo/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM administradores WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Administrador no encontrado." });
    res.json({ message: "Administrador eliminado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


// ─────────────────────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});