import "./loadEnv.js";
import jwt from "jsonwebtoken";
import multer from "multer";
import XLSX from "xlsx-js-style";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import pg from "pg";
const { Pool } = pg;

const directPool = new Pool({
  connectionString: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 0
});

const upload   = multer({ storage: multer.memoryStorage() });
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const SECRET     = process.env.JWT_SECRET || "supersecretkey";

// ── Middleware: verificar JWT ─────────────────────────────────
function verificarToken(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'No autorizado' });
  try {
    req.usuario = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Middleware: solo admins con rol 'admin' pueden escribir ───
function soloAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin')
    return res.status(403).json({ error: 'No tienes permisos para esta acción' });
  next();
}

async function recalcularEstadoEscuela(escuelaId) {
  const niveles = await pool.query(
    `SELECT COUNT(*) AS total,
     COUNT(*) FILTER (WHERE cct IS NULL OR personal_escolar IS NULL OR estudiantes IS NULL) AS incompletos
     FROM escuela_niveles WHERE escuela_id = $1`,
    [escuelaId]
  );
  const { total, incompletos } = niveles.rows[0];
  const estado = (parseInt(total) > 0 && parseInt(incompletos) === 0) ? 'completa' : 'incompleta';
  await pool.query(`UPDATE escuelas SET estado = $1 WHERE id = $2`, [estado, escuelaId]);
  return estado;
}

console.log("DB URL:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"));

const app = express();
app.use(cors());
app.use(express.json());
const staticPath =
  process.env.NODE_ENV === "production"
    ? __dirname
    : path.join(__dirname, "..");

app.use(express.static(staticPath));
app.get("/", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});


// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

function validarFormularioBase(body) {
  const { correo, telefono, aviso_privacidad_aceptado } = body;

  if (!telefono)
    return "Teléfono es obligatorio.";

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

app.get("/api/catalogo/:id/subcategorias", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        sc.id, sc.nombre, sc.imagen,
        sc.categoria_catalogo_id,
        sc.subcategoria_real_id,
        c.nombre AS categoria_real_nombre,
        s.nombre AS subcategoria_real_nombre
      FROM subcategorias_catalogo sc
      LEFT JOIN subcategorias s ON sc.subcategoria_real_id = s.id
      LEFT JOIN categorias    c ON s.categoria_id          = c.id
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

app.get("/api/data", async (req, res) => {
  try {
    const { municipio, escuela, categoria_id, subcategoria_id, solo_pendientes } = req.query;

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
    if (municipio)          { values.push(municipio);          conditions.push(`municipio = $${values.length}`); }
    if (escuela)            { values.push(escuela);            conditions.push(`escuela = $${values.length}`); }
    if (categoriaRealId)    { values.push(categoriaRealId);    conditions.push(`categoria_id = $${values.length}`); }
    if (subcategoriaRealId) { values.push(subcategoriaRealId); conditions.push(`subcategoria_id = $${values.length}`); }
    if (solo_pendientes === 'true') {
      conditions.push(`estado NOT IN ('Cubierto', 'Cubierto parcialmente')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT *
       FROM vista_necesidades_completa
       ${where}
       ORDER BY id`,
      values
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});


//GOOGLE MAPS NECESIDADES

app.get("/api/escuela-direccion", async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre) return res.status(400).json({ error: "Falta el nombre" });

    const result = await pool.query(
      `SELECT direccion FROM escuelas WHERE nombre = $1 LIMIT 1`,
      [nombre]
    );

    if (result.rows.length === 0 || !result.rows[0].direccion) {
      return res.json({ direccion: null });
    }

    res.json({ direccion: result.rows[0].direccion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// ─────────────────────────────────────────────────────────────
// FORMULARIOS PÚBLICOS
// ─────────────────────────────────────────────────────────────

app.post("/api/contacto", verificarToken, async (req, res) => {
  try {
    // Validar que sea donador
    if (req.usuario.rol !== 'donador') {
      return res.status(403).json({ error: 'Solo donadores pueden enviar solicitudes' });
    }

    const error = validarFormularioBase(req.body);
    if (error) return res.status(400).json({ error });

    const {
      tipo_instancia, nombre_instancia,
      correo, telefono, mensaje, aviso_privacidad_aceptado, tipo_donacion
    } = req.body;

    // Datos oficiales de la cuenta
    const donadorId = req.usuario.id;

    const result = await pool.query(
      `INSERT INTO solicitudes_donacion (
        tipo_instancia, nombre_instancia,
        correo, telefono, mensaje, origen_formulario,
        aviso_privacidad_aceptado, tipo_donacion, donador_id
      )
      VALUES ($1, $2, $3, $4, $5, 'contacto', $6, $7, $8)
      RETURNING id`,
      [tipo_instancia||null, nombre_instancia||null,
      correo||null, telefono, mensaje||null,
      aviso_privacidad_aceptado, tipo_donacion||null, donadorId]
    );

    res.status(201).json({ message: "Formulario guardado.", solicitud_id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar el formulario." });
  }
});

app.post("/api/solicitud-material", verificarToken, async (req, res) => {
  try {
    // Validar que sea donador
    if (req.usuario.rol !== 'donador') {
      return res.status(403).json({ error: 'Solo donadores pueden enviar solicitudes' });
    }

    const error = validarFormularioBase(req.body);
    if (error) return res.status(400).json({ error });

    const {
      tipo_instancia, nombre_instancia,
      correo, telefono, mensaje,
      aviso_privacidad_aceptado, materiales
    } = req.body;

    if (!Array.isArray(materiales) || materiales.length === 0)
      return res.status(400).json({ error: "Debes enviar al menos un material." });

    // donadorId siempre existe y es válido
    const donadorId = req.usuario.id;

    // Una sola llamada reemplaza todo el BEGIN/FOR/COMMIT
    const result = await pool.query(
      `CALL sp_registrar_solicitud_material($1,$2,$3,$4,$5,$6,$7,$8::jsonb, NULL)`,
      [
        tipo_instancia || null, nombre_instancia || null,
        correo || null, telefono, mensaje || null,
        aviso_privacidad_aceptado, donadorId,
        JSON.stringify(materiales)
      ]
    );

    const solicitudId = result.rows[0].p_solicitud_id;
    res.status(201).json({ message: "Solicitud guardada.", solicitud_id: solicitudId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error al guardar la solicitud." });
  }
});


// ─────────────────────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────

app.post("/api/auth/register-donador", async (req, res) => {
  try {
    const { nombre_completo, correo, password, fecha_nacimiento, estado_geografico } = req.body;
    if (!nombre_completo || !correo || !password || !estado_geografico)
      return res.status(400).json({ error: "Nombre, correo, contraseña y estado son requeridos." });

    const existe = await pool.query("SELECT id FROM donadores WHERE correo = $1", [correo]);
    if (existe.rows.length > 0)
      return res.status(400).json({ error: "Ya existe una cuenta con ese correo." });

    await pool.query(
      `INSERT INTO donadores (nombre_completo, correo, password_hash, fecha_nacimiento, estado_geografico)
      VALUES ($1, $2, $3, $4, $5)`,
      [nombre_completo, correo, password, fecha_nacimiento||null, estado_geografico||null]
    );
    res.status(201).json({ message: "Cuenta creada exitosamente." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor." });
  }
});

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

// Login de administrador — devuelve JWT con el rol real de la BD ('admin' o 'lector')
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
      { id: user.id, correo: user.correo, rol: user.rol, nombre: user.nombre },
      SECRET,
      { expiresIn: "4h" }
    );
    res.json({ message: "Acceso concedido", token, rol: user.rol });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor." });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — NECESIDADES
// ─────────────────────────────────────────────────────────────

// GET — Busca necesidades con filtros (lectura, sin restricción de rol)
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

// GET — Detalle de una necesidad por ID (lectura, sin restricción de rol)
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

// POST — Crear necesidad (solo admin)
app.post("/api/admin/necesidades", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { escuela, municipio, subcategoria_id, propuesta, cantidad, unidad, estado, detalles } = req.body;

    if (!escuela || !municipio || !subcategoria_id || !propuesta || cantidad == null || !unidad)
      return res.status(400).json({ error: "Faltan campos obligatorios" });

    const escuelaRes = await pool.query(
      "SELECT fn_upsert_escuela($1, $2) AS escuela_id",
      [municipio, escuela]
    );
    const escuelaId = escuelaRes.rows[0].escuela_id;

    const estadosValidos = ["Cubierto", "Aun no cubierto", "Cubierto parcialmente"];
    const estadoFinal    = estadosValidos.includes(estado) ? estado : "Aun no cubierto";

    const result = await pool.query(
      `INSERT INTO necesidades (escuela_id, subcategoria_id, propuesta, cantidad, unidad, estado, detalles)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [escuelaId, subcategoria_id, propuesta, cantidad, unidad, estadoFinal, detalles || null]
    );

    res.status(201).json({ id: result.rows[0].id, message: "Necesidad creada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// PUT — Actualizar necesidad (solo admin)
app.put("/api/admin/necesidades/:id", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { escuela, municipio, subcategoria_id, propuesta, cantidad, unidad, estado, detalles } = req.body;

    const existe = await pool.query("SELECT id FROM necesidades WHERE id = $1", [id]);
    if (existe.rows.length === 0)
      return res.status(404).json({ error: "Necesidad no encontrada" });

    // fn_upsert_escuela solo si vienen ambos campos
    let escuelaId = null;
    if (escuela && municipio) {
      const escuelaRes = await pool.query(
        "SELECT fn_upsert_escuela($1, $2) AS escuela_id",
        [municipio, escuela]
      );
      escuelaId = escuelaRes.rows[0].escuela_id;
    }

    const sets   = [];
    const values = [];
    if (escuelaId)              { values.push(escuelaId);       sets.push(`escuela_id = $${values.length}`); }
    if (subcategoria_id)        { values.push(subcategoria_id); sets.push(`subcategoria_id = $${values.length}`); }
    if (propuesta  !== undefined){ values.push(propuesta);      sets.push(`propuesta = $${values.length}`); }
    if (cantidad   !== undefined){ values.push(cantidad);       sets.push(`cantidad = $${values.length}`); }
    if (unidad     !== undefined){ values.push(unidad);         sets.push(`unidad = $${values.length}`); }
    if (estado     !== undefined){ values.push(estado);         sets.push(`estado = $${values.length}`); }
    if (detalles   !== undefined){ values.push(detalles);       sets.push(`detalles = $${values.length}`); }

    if (sets.length === 0)
      return res.status(400).json({ error: "No se enviaron campos para actualizar" });

    values.push(id);
    await pool.query(
      `UPDATE necesidades SET ${sets.join(", ")} WHERE id = $${values.length}`,
      values
    );

    res.json({ message: "Necesidad actualizada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// DELETE — Eliminar necesidad (solo admin)
app.delete("/api/admin/necesidades/:id", verificarToken, soloAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM necesidades WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Necesidad no encontrada" });
    res.json({ message: "Necesidad eliminada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

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

app.get("/api/admin/excel/info", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) AS total, MAX(id) AS ultimo_id FROM necesidades");
    res.json({ total: parseInt(result.rows[0].total), ultimoId: result.rows[0].ultimo_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

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

// POST — Subir Excel (solo admin)
app.post("/api/admin/excel/subir", verificarToken, soloAdmin, upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const filas    = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    if (filas.length === 0) return res.status(400).json({ error: "El archivo no contiene datos" });
    if (filas.length < 2)   return res.status(400).json({ error: "El archivo parece incompleto. Operación cancelada." });

    const clean = v => v ? String(v).trim() : null;
    const erroresValidacion = [];

    // ═══ PASO 1: VALIDACIÓN PRE-INSERT ═══
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numeroFila = i + 2; // +2 porque empezamos en fila 2 del Excel

      const municipio    = clean(fila["Municipio"]);
      const categoria    = clean(fila["Categoría"]    || fila["Categoria"]);
      const subcategoria = clean(fila["Subcategoría"] || fila["Subcategoria"]);
      const escuela      = clean(fila["Escuela"]);
      const propuesta    = clean(fila["Propuesta"]);
      const cantidad     = parseInt(fila["Cantidad"]) || 0;
      const unidad       = clean(fila["Unidad"]);
      const estado       = clean(fila["Estado"]) || "Aun no cubierto";

      // Validar con función de base de datos
      try {
        const result = await pool.query(
          "SELECT fn_validar_fila_excel($1, $2, $3, $4, $5, $6, $7, $8) as error",
          [municipio, categoria, subcategoria, escuela, propuesta, cantidad, unidad, estado]
        );
        
        const errorMsg = result.rows[0].error;
        if (errorMsg) {
          erroresValidacion.push({
            fila: numeroFila,
            error: errorMsg,
            datos: {
              municipio: municipio || "[vacío]",
              escuela: escuela || "[vacío]", 
              propuesta: propuesta || "[vacío]"
            }
          });
        }
      } catch (err) {
        erroresValidacion.push({
          fila: numeroFila,
          error: "Error de validación: " + err.message,
          datos: { municipio, escuela, propuesta }
        });
      }
    }

    // ═══ SI HAY ERRORES, DEVOLVER TODOS SIN TOCAR BD ═══
    if (erroresValidacion.length > 0) {
      return res.status(400).json({
        error: "Se encontraron errores en el archivo",
        total_errores: erroresValidacion.length,
        total_filas: filas.length,
        errores: erroresValidacion.slice(0, 20), // Solo primeros 20 para no sobrecargar
        mensaje: `Corrige ${erroresValidacion.length} error(es) y vuelve a intentar`
      });
    }

    // ═══ PASO 2: INSERCIÓN (solo si no hay errores) ═══
    const normalizeEstado = v => {
      const s = String(v || "").toLowerCase().trim();
      if (s === "cubierto") return "Cubierto";
      if (s === "cubierto parcialmente") return "Cubierto parcialmente";
      if (s === "aun no cubierto" || s === "aún no cubierto") return "Aun no cubierto";
      return "Aun no cubierto";
    };

    const client = await directPool.connect();
    client.on('error', (err) => {
      console.error('Client error durante subida de Excel:', err.message);
    });

    let insertados = 0;

    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE TABLE necesidades RESTART IDENTITY CASCADE");

      // ── Pre-calcular todos los IDs fuera del INSERT ──
      const filasProcesadas = [];

      for (const fila of filas) {
        const clean = v => v ? String(v).trim() : null;
        const municipio    = clean(fila["Municipio"]);
        const categoria    = clean(fila["Categoría"]    || fila["Categoria"]);
        const subcategoria = clean(fila["Subcategoría"] || fila["Subcategoria"]);
        const escuela      = clean(fila["Escuela"]);
        const propuesta    = clean(fila["Propuesta"]);
        const cantidad     = parseInt(fila["Cantidad"]) || 1;
        const unidad       = clean(fila["Unidad"]);
        const detalles     = clean(fila["Detalles"]) || null;
        const estado       = normalizeEstado(fila["Estado"]);

        const categoriaId =
          (await client.query("SELECT id FROM categorias WHERE nombre = $1", [categoria])).rows[0]?.id
          ?? (await client.query("INSERT INTO categorias (nombre) VALUES ($1) RETURNING id", [categoria])).rows[0].id;

        const subcategoriaId =
          (await client.query("SELECT id FROM subcategorias WHERE nombre = $1 AND categoria_id = $2", [subcategoria, categoriaId])).rows[0]?.id
          ?? (await client.query("INSERT INTO subcategorias (nombre, categoria_id) VALUES ($1, $2) RETURNING id", [subcategoria, categoriaId])).rows[0].id;

        const escuelaId =
          (await client.query("SELECT fn_upsert_escuela($1, $2) AS escuela_id", [municipio, escuela])).rows[0].escuela_id;

        filasProcesadas.push([escuelaId, subcategoriaId, propuesta, cantidad, unidad, estado, detalles]);
      }

      // ── Un solo INSERT con todas las filas ──
      const valores = filasProcesadas.map((_, i) => {
        const base = i * 7;
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`;
      });

      const params = filasProcesadas.flat();

      await client.query(
        `INSERT INTO necesidades (escuela_id, subcategoria_id, propuesta, cantidad, unidad, estado, detalles)
        VALUES ${valores.join(', ')}`,
        params
      );

      insertados = filasProcesadas.length;

      await client.query("COMMIT");
      res.json({
        message: `Importación completada exitosamente: ${insertados} registros insertados.`,
        insertados,
        total_procesados: filas.length
      });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error en inserción:", err);
      res.status(500).json({
        error: "Error durante la inserción: " + err.message,
        nota: "No se realizaron cambios en la base de datos"
      });
    } finally {
      client.release();
    }
    
    } catch (err) {
    console.error("Error procesando archivo:", err);
    res.status(500).json({ error: "Error procesando el archivo: " + err.message });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — BANDEJA DE SOLICITUDES
// ─────────────────────────────────────────────────────────────

// GET — Todas las solicitudes excepto ocultas (lectura, sin restricción de rol)
app.get("/api/admin/solicitudes", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sd.id, d.nombre_completo, sd.tipo_instancia, sd.nombre_instancia,
              d.correo, sd.telefono, sd.mensaje, sd.origen_formulario,
              sd.tipo_donacion, sd.estado_lectura, sd.created_at
      FROM solicitudes_donacion sd
      JOIN donadores d ON sd.donador_id = d.id
      WHERE sd.estado_lectura != 'oculta' OR sd.estado_lectura IS NULL
      ORDER BY sd.created_at DESC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// GET — Materiales de una solicitud (lectura, sin restricción de rol)
app.get("/api/admin/solicitudes/:id/materiales", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.nombre AS escuela, sm.propuesta, sm.cantidad, sm.unidad
       FROM solicitud_materiales sm
       LEFT JOIN escuelas e ON sm.escuela_id = e.id
       WHERE sm.solicitud_id = $1`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// PATCH — Cambiar estado de lectura (solo admin)
app.patch("/api/admin/solicitudes/:id/estado", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { estado_lectura } = req.body;
    await pool.query(
      "CALL sp_cambiar_estado_lectura($1, $2)",
      [req.params.id, estado_lectura]
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

// GET — Solicitudes paginadas con filtros (lectura, sin restricción de rol)
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
        sd.id, d.nombre_completo, sd.tipo_instancia, sd.nombre_instancia,
        d.correo, sd.telefono, sd.mensaje, sd.tipo_donacion,
        sd.origen_formulario, sd.estado_lectura, sd.created_at,
        COALESCE(sd.estatus_gestion, 'nueva') AS estatus_gestion,
        COALESCE(sd.notas_admin, '')          AS notas_admin,
        COALESCE(
          json_agg(json_build_object(
            'escuela', e.nombre, 'propuesta', sm.propuesta,
            'cantidad', sm.cantidad, 'unidad', sm.unidad
          )) FILTER (WHERE sm.id IS NOT NULL),
          '[]'
        ) AS materiales
      FROM solicitudes_donacion sd
      JOIN donadores d ON sd.donador_id = d.id
      LEFT JOIN solicitud_materiales sm ON sm.solicitud_id = sd.id
      LEFT JOIN escuelas e ON sm.escuela_id = e.id
      ${where}
      GROUP BY sd.id, d.nombre_completo, d.correo
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

// PATCH — Editar solicitud (solo admin)
app.patch("/api/admin/gestion-solicitudes/:id", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { estatus_gestion, notas_admin, telefono, mensaje, nombre_completo, correo } = req.body;
    
    // Actualizar solicitudes_donacion
    const solicitudSets = [];
    const solicitudValues = [];

    if (estatus_gestion !== undefined) {
      solicitudValues.push(estatus_gestion); 
      solicitudSets.push(`estatus_gestion = $${solicitudValues.length}`);
    }
    if (notas_admin !== undefined) { 
      solicitudValues.push(notas_admin); 
      solicitudSets.push(`notas_admin = $${solicitudValues.length}`); 
    }
    if (telefono !== undefined) { 
      solicitudValues.push(telefono); 
      solicitudSets.push(`telefono = $${solicitudValues.length}`); 
    }
    if (mensaje !== undefined) { 
      solicitudValues.push(mensaje); 
      solicitudSets.push(`mensaje = $${solicitudValues.length}`); 
    }

    // Actualizar tabla solicitudes_donacion si hay cambios
    if (solicitudSets.length > 0) {
      solicitudValues.push(req.params.id);
      await pool.query(
        `UPDATE solicitudes_donacion SET ${solicitudSets.join(", ")} WHERE id = $${solicitudValues.length}`, 
        solicitudValues
      );
    }

    // Actualizar tabla donadores si hay cambios
    if (nombre_completo !== undefined || correo !== undefined) {
      const donadorSets = [];
      const donadorValues = [];
      
      if (nombre_completo !== undefined) { 
        donadorValues.push(nombre_completo); 
        donadorSets.push(`nombre_completo = $${donadorValues.length}`); 
      }
      if (correo !== undefined) { 
        donadorValues.push(correo); 
        donadorSets.push(`correo = $${donadorValues.length}`); 
      }
      
      if (donadorSets.length > 0) {
        donadorValues.push(req.params.id);
        await pool.query(
          `UPDATE donadores SET ${donadorSets.join(", ")} 
           WHERE id = (SELECT donador_id FROM solicitudes_donacion WHERE id = $${donadorValues.length})`, 
          donadorValues
        );
      }
    }

    res.json({ message: "Solicitud actualizada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor: " + err.message });
  }
});


// ─────────────────────────────────────────────────────────────
// ADMIN — PANEL (MÉTRICAS)
// ─────────────────────────────────────────────────────────────

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
          COUNT(*) FILTER (WHERE tipo_donacion = 'Donación material')   AS material,
          COUNT(*) FILTER (WHERE tipo_donacion = 'Donación económica')  AS economica,
          COUNT(*) FILTER (WHERE tipo_donacion = 'Voluntariado')        AS voluntariado,
          COUNT(*) FILTER (WHERE tipo_donacion = 'Brindar talleres')    AS talleres,
          COUNT(*) FILTER (WHERE tipo_donacion = 'Vinculaciones')       AS vinculaciones
        FROM solicitudes_donacion
      `),
      pool.query("SELECT id, nombre_completo, correo, estado_geografico, created_at FROM donadores ORDER BY created_at DESC LIMIT 10"),
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

// GET — Ver equipo (cualquier admin autenticado, incluyendo lector)
app.get("/api/admin/equipo", verificarToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, nombre, correo, rol, imagen FROM administradores ORDER BY id");
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// POST — Crear administrador (solo admin)
app.post("/api/admin/equipo", verificarToken, soloAdmin, async (req, res) => {
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

// PATCH — Editar administrador (solo admin)
app.patch("/api/admin/equipo/:id", verificarToken, soloAdmin, async (req, res) => {
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

// DELETE — Eliminar administrador (solo admin)
app.delete("/api/admin/equipo/:id", verificarToken, soloAdmin, async (req, res) => {
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

// GET — Historial de donaciones del donador autenticado
app.get("/api/donador/historial", verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'donador')
      return res.status(403).json({ error: 'No autorizado' });

    const result = await pool.query(
      `SELECT
         sd.id, sd.tipo_donacion, sd.origen_formulario,
         sd.estatus_gestion, sd.created_at,
         COALESCE(
           json_agg(json_build_object(
             'escuela', e.nombre, 'propuesta', sm.propuesta,
             'cantidad', sm.cantidad, 'unidad', sm.unidad
           )) FILTER (WHERE sm.id IS NOT NULL),
           '[]'
         ) AS materiales
       FROM solicitudes_donacion sd
       LEFT JOIN solicitud_materiales sm ON sm.solicitud_id = sd.id
       LEFT JOIN escuelas e ON sm.escuela_id = e.id
       WHERE sd.donador_id = $1
       GROUP BY sd.id
       ORDER BY sd.created_at DESC`,
      [req.usuario.id]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// GET — Contadores para métricas
app.get("/api/admin/escuelas/metricas", verificarToken, async (req, res) => {
  try {
    const incompletas = await pool.query(
      "SELECT COUNT(*) FROM escuelas WHERE estado = 'incompleta'"
    );
    const completas = await pool.query(
      "SELECT COUNT(*) FROM escuelas WHERE estado = 'completa'"
    );
    const total = await pool.query("SELECT COUNT(*) FROM escuelas");

    res.json({
      data: {
        total: parseInt(total.rows[0].count),
        completas: parseInt(completas.rows[0].count),
        incompletas: parseInt(incompletas.rows[0].count)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// GET — Lista de escuelas con filtros y paginación
app.get("/api/admin/escuelas", verificarToken, async (req, res) => {
  try {
    const { busqueda, municipio_id, estado, pagina = 1, limite = 15 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    const conditions = [];
    const values = [];

    if (busqueda) {
      values.push(`%${busqueda}%`);
      conditions.push(`(e.nombre ILIKE $${values.length} OR e.direccion ILIKE $${values.length})`);
    }
    if (municipio_id) {
      values.push(municipio_id);
      conditions.push(`e.municipio_id = $${values.length}`);
    }
    if (estado) {
      values.push(estado);
      conditions.push(`e.estado = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Contar total
    const totalRes = await pool.query(
      `SELECT COUNT(*) FROM escuelas e ${where}`,
      values
    );

    // Obtener datos
    values.push(parseInt(limite), offset);
    const dataRes = await pool.query(
      `SELECT 
        e.id, e.nombre, e.direccion, e.estado, e.created_at, e.updated_at,
        e.municipio_id,
        m.nombre AS municipio_nombre,
        COUNT(DISTINCT n.id) AS total_necesidades,
        COUNT(DISTINCT en.id) AS total_niveles
      FROM escuelas e
      LEFT JOIN municipios m ON e.municipio_id = m.id
      LEFT JOIN necesidades n ON e.id = n.escuela_id
      LEFT JOIN escuela_niveles en ON e.id = en.escuela_id
      ${where}
      GROUP BY e.id, m.nombre
      ORDER BY 
        CASE WHEN e.estado = 'incompleta' THEN 0 ELSE 1 END,
        e.created_at DESC
      LIMIT $${values.length-1} OFFSET $${values.length}`,
      values
    );

    res.json({
      data: dataRes.rows,
      total: parseInt(totalRes.rows[0].count),
      pagina: parseInt(pagina),
      limite: parseInt(limite)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// GET — Detalle de una escuela
app.get("/api/admin/escuelas/:id", verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        e.id, e.nombre, e.direccion, e.estado, e.created_at, e.updated_at,
        e.municipio_id, m.nombre AS municipio_nombre,
        COUNT(DISTINCT n.id) AS total_necesidades
      FROM escuelas e
      LEFT JOIN municipios m ON e.municipio_id = m.id
      LEFT JOIN necesidades n ON e.id = n.escuela_id
      WHERE e.id = $1
      GROUP BY e.id, m.nombre`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Escuela no encontrada" });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// POST — Crear escuela completa (solo admin)
app.post("/api/admin/escuelas", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { nombre, municipio_id, direccion } = req.body;

    if (!nombre || !municipio_id)
      return res.status(400).json({ error: "Nombre y municipio son obligatorios" });

    const result = await pool.query(
      `INSERT INTO escuelas (nombre, municipio_id, direccion, estado)
       VALUES ($1, $2, $3, 'incompleta') RETURNING id`,
      [nombre, municipio_id, direccion || null]
    );

    res.status(201).json({ id: result.rows[0].id, message: "Escuela creada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// PUT — Actualizar escuela (solo admin)
app.put("/api/admin/escuelas/:id", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, municipio_id, direccion } = req.body;

    const existe = await pool.query("SELECT id FROM escuelas WHERE id = $1", [id]);
    if (existe.rows.length === 0)
      return res.status(404).json({ error: "Escuela no encontrada" });

    const sets = [];
    const values = [];
    if (nombre !== undefined)      { values.push(nombre);      sets.push(`nombre = $${values.length}`); }
    if (municipio_id !== undefined) { values.push(municipio_id); sets.push(`municipio_id = $${values.length}`); }
    if (direccion !== undefined)    { values.push(direccion);    sets.push(`direccion = $${values.length}`); }

    if (sets.length === 0)
      return res.status(400).json({ error: "No se enviaron campos para actualizar" });

    values.push(id);
    await pool.query(`UPDATE escuelas SET ${sets.join(", ")} WHERE id = $${values.length}`, values);

    res.json({ message: "Escuela actualizada exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// DELETE — Eliminar escuela (solo admin)
app.delete("/api/admin/escuelas/:id", verificarToken, soloAdmin, async (req, res) => {
  try {
    const necesidades = await pool.query(
      "SELECT COUNT(*) as total FROM necesidades WHERE escuela_id = $1",
      [req.params.id]
    );

    if (parseInt(necesidades.rows[0].total) > 0) {
      return res.status(400).json({
        error: `No se puede eliminar la escuela porque tiene ${necesidades.rows[0].total} necesidad(es) asociada(s)`
      });
    }

    const result = await pool.query(
      "DELETE FROM escuelas WHERE id = $1 RETURNING nombre",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Escuela no encontrada" });
    }

    res.json({
      message: `Escuela "${result.rows[0].nombre}" eliminada exitosamente`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// GET — Lista de municipios para select
app.get("/api/admin/municipios", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre FROM municipios ORDER BY nombre"
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// GET — Obtener perfil del donador
app.get("/api/donador/perfil", verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'donador') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await pool.query(
      `SELECT nombre_completo, correo, fecha_nacimiento, estado_geografico, created_at
       FROM donadores WHERE id = $1`,
      [req.usuario.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Donador no encontrado' });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// PUT — Actualizar perfil del donador
app.put("/api/donador/perfil", verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'donador') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { nombre_completo, correo, fecha_nacimiento, estado_geografico } = req.body;

    // Validaciones
    if (nombre_completo !== undefined) {
      const partes = nombre_completo.trim().split(' ').filter(p => p.length > 0);
      if (partes.length < 2)
        return res.status(400).json({ error: "Ingresa tu nombre completo (nombre y apellido)." });
    }

    if (correo !== undefined) {
      const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!regexCorreo.test(correo))
        return res.status(400).json({ error: "Ingresa un correo electrónico válido." });

      const existe = await pool.query(
        "SELECT id FROM donadores WHERE correo = $1 AND id != $2",
        [correo, req.usuario.id]
      );
      if (existe.rows.length > 0)
        return res.status(400).json({ error: "Ya existe una cuenta con ese correo." });
    }

    if (fecha_nacimiento) {
      const fechaNac = new Date(fecha_nacimiento);
      const hoy = new Date();
      let edad = hoy.getFullYear() - fechaNac.getFullYear();
      if (hoy.getMonth() < fechaNac.getMonth() ||
         (hoy.getMonth() === fechaNac.getMonth() && hoy.getDate() < fechaNac.getDate())) {
        edad--;
      }
      if (edad < 18)
        return res.status(400).json({ error: "Debes ser mayor de 18 años." });
    }

    const sets = [];
    const values = [];
    if (nombre_completo) { values.push(nombre_completo.trim()); sets.push(`nombre_completo = $${values.length}`); }
    if (correo)          { values.push(correo);                  sets.push(`correo = $${values.length}`); }
    if (fecha_nacimiento !== undefined) { values.push(fecha_nacimiento); sets.push(`fecha_nacimiento = $${values.length}`); }
    if (estado_geografico) { values.push(estado_geografico);     sets.push(`estado_geografico = $${values.length}`); }

    if (sets.length === 0)
      return res.status(400).json({ error: "No hay campos para actualizar" });

    values.push(req.usuario.id);
    await pool.query(`UPDATE donadores SET ${sets.join(", ")} WHERE id = $${values.length}`, values);

    res.json({ message: "Perfil actualizado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar perfil" });
  }
});

// GET niveles de una escuela
app.get("/api/admin/escuelas/:id/niveles", verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, nivel_educativo, modalidad, turno, sostenimiento, cct, personal_escolar, estudiantes
       FROM escuela_niveles WHERE escuela_id = $1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en servidor" });
  }
});

// POST crear nivel
app.post("/api/admin/escuelas/:id/niveles", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { nombre, nivel_educativo, modalidad, turno, sostenimiento, cct, personal_escolar, estudiantes } = req.body;

    if (!nombre || !nivel_educativo || !modalidad || !turno || !sostenimiento)
      return res.status(400).json({ error: "Nombre, nivel, modalidad, turno y sostenimiento son obligatorios." });

    await pool.query(
      `INSERT INTO escuela_niveles (escuela_id, nombre, nivel_educativo, modalidad, turno, sostenimiento, cct, personal_escolar, estudiantes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [req.params.id, nombre, nivel_educativo, modalidad, turno, sostenimiento, cct || null, personal_escolar || null, estudiantes || null]
    );

    await recalcularEstadoEscuela(req.params.id);
    res.status(201).json({ message: "Nivel agregado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// PUT editar nivel
app.put("/api/admin/escuelas/:id/niveles/:nivel_id", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { nombre, nivel_educativo, modalidad, turno, sostenimiento, cct, personal_escolar, estudiantes } = req.body;

    if (!nombre || !nivel_educativo || !modalidad || !turno || !sostenimiento)
      return res.status(400).json({ error: "Nombre, nivel, modalidad, turno y sostenimiento son obligatorios." });

    await pool.query(
      `UPDATE escuela_niveles SET
         nombre = $1, nivel_educativo = $2, modalidad = $3, turno = $4,
         sostenimiento = $5, cct = $6, personal_escolar = $7, estudiantes = $8
       WHERE id = $9 AND escuela_id = $10`,
      [nombre, nivel_educativo, modalidad, turno, sostenimiento, cct || null, personal_escolar || null, estudiantes || null, req.params.nivel_id, req.params.id]
    );

    await recalcularEstadoEscuela(req.params.id);
    res.status(200).json({ message: "Nivel actualizado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// DELETE eliminar nivel
app.delete("/api/admin/escuelas/:id/niveles/:nivel_id", verificarToken, soloAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM escuela_niveles WHERE id = $1 AND escuela_id = $2 RETURNING id`,
      [req.params.nivel_id, req.params.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Nivel no encontrado." });

    await recalcularEstadoEscuela(req.params.id);
    res.json({ message: "Nivel eliminado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// POST — Crear municipio si no existe
app.post("/api/admin/municipios", verificarToken, soloAdmin, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || nombre.trim().length < 2)
      return res.status(400).json({ error: "Nombre del municipio inválido." });

    const existe = await pool.query(
      "SELECT id FROM municipios WHERE LOWER(nombre) = LOWER($1)", [nombre.trim()]
    );
    if (existe.rows.length > 0)
      return res.json({ id: existe.rows[0].id, nombre: nombre.trim() });

    const result = await pool.query(
      "INSERT INTO municipios (nombre) VALUES ($1) RETURNING id, nombre",
      [nombre.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error en servidor" });
  }
});

// INICIO

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});