// scripts/import-to-supabase.js
import "../loadEnv.js";

import XLSX from "xlsx";
import pkg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;

// __dirname no existe en ESM, lo reconstruimos a partir de la URL del módulo
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔑 CONFIG SUPABASE
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 📁 Leer Excel (ruta segura)
const filePath = path.join(__dirname, "data.xlsx");
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { range: 3 });

// 🧼 Limpieza
const clean = (val) => (val ? String(val).trim() : null);

// 🧠 Normalizar estado
const normalizeEstado = (estado) => {
  if (!estado) return "Aun no cubierto";

  const val = String(estado).toLowerCase().trim();

  if (val === "cubierto") return "Cubierto";
  if (val === "cubierto parcialmente") return "Cubierto parcialmente";
  if (val === "aun no cubierto" || val === "aún no cubierto") return "Aun no cubierto";

  // Si llega algo que no reconocemos, lo logueamos y asumimos "Aun no cubierto"
  console.warn(`⚠️ Estado desconocido: "${estado}" → usando "Aun no cubierto"`);
  return "Aun no cubierto";
};

async function run() {
  console.log("🚀 Iniciando script...");
  console.log("📊 Filas detectadas:", data.length);

  const client = await pool.connect();
  console.log("🔌 Conectado a Supabase");

  try {
    await client.query("BEGIN");

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      console.log(`➡️ Fila ${i + 1} de ${data.length}`);

      const municipio = clean(row["Municipio"]);
      const categoria = clean(row["Categoría"]);
      const subcategoria = clean(row["Subcategoría"]);
      const escuela = clean(row["Escuela"]);
      const propuesta = clean(row["Propuesta"]);
      const cantidad = parseInt(row["Cantidad"]) || 1;
      const unidad = clean(row["Unidad"]);
      const detalles = clean(row["Detalles"]);
      const estado = normalizeEstado(row["Estado"]);

      if (!municipio || !categoria || !subcategoria || !escuela || !propuesta) {
        console.log("⚠️ Fila omitida por datos incompletos");
        continue;
      }

      // 🏙️ MUNICIPIO
      const municipioRes = await client.query(
        `INSERT INTO municipios(nombre)
         VALUES($1)
         ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [municipio]
      );
      const municipio_id = municipioRes.rows[0].id;

      // 📂 CATEGORIA
      const categoriaRes = await client.query(
        `INSERT INTO categorias(nombre)
         VALUES($1)
         ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [categoria]
      );
      const categoria_id = categoriaRes.rows[0].id;

      // 🗂️ SUBCATEGORIA
      let subcategoria_id;
      const subcatExist = await client.query(
        `SELECT id FROM subcategorias
         WHERE nombre = $1 AND categoria_id = $2`,
        [subcategoria, categoria_id]
      );

      if (subcatExist.rows.length > 0) {
        subcategoria_id = subcatExist.rows[0].id;
      } else {
        const subcatRes = await client.query(
          `INSERT INTO subcategorias(nombre, categoria_id)
           VALUES($1, $2)
           RETURNING id`,
          [subcategoria, categoria_id]
        );
        subcategoria_id = subcatRes.rows[0].id;
      }

      // 🏫 ESCUELA
      let escuela_id;
      const escuelaExist = await client.query(
        `SELECT id FROM escuelas
         WHERE nombre = $1 AND municipio_id = $2`,
        [escuela, municipio_id]
      );

      if (escuelaExist.rows.length > 0) {
        escuela_id = escuelaExist.rows[0].id;
      } else {
        const escuelaRes = await client.query(
          `INSERT INTO escuelas(nombre, municipio_id)
           VALUES($1, $2)
           RETURNING id`,
          [escuela, municipio_id]
        );
        escuela_id = escuelaRes.rows[0].id;
      }

      // 📌 NECESIDAD
      await client.query(
        `INSERT INTO necesidades(
          escuela_id,
          subcategoria_id,
          propuesta,
          cantidad,
          unidad,
          estado,
          detalles
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          escuela_id,
          subcategoria_id,
          propuesta,
          cantidad,
          unidad,
          estado,
          detalles
        ]
      );
    }

    await client.query("COMMIT");
    console.log(`✅ Importación completa: ${data.length} registros`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error durante importación:", err);
  } finally {
    client.release();
    pool.end();
    console.log("🔚 Conexión cerrada");
  }
}

run();