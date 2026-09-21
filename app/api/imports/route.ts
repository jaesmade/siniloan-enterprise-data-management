import { Readable } from "node:stream";

import ExcelJS from "exceljs";
import * as XLSX from "@e965/xlsx";
import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const DATASETS = {
  jobseekers: { slug: "jobseeker_registry", department: "PESO", schema: "jobseekers", table: "people" },
  research: { slug: "research_requests", department: "MPDO", schema: "research", table: "requests" },
  biometrics: { slug: "biometric_events", department: "AGRI", schema: "biometrics", table: "device_events" },
} as const;

type ModuleKey = keyof typeof DATASETS;
type SourceRow = { sourceRowNumber: number; values: Record<string, unknown> };
type ImportError = {
  source_row_number: number;
  field_name?: string;
  error_code: string;
  message: string;
  safe_context?: Record<string, string>;
};

function cleanHeader(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
  if ("text" in value) return value.text;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  return String(value);
}

function meaningful(value: unknown) {
  const text = String(value ?? "").trim();
  return text && !["NA", "N/A", "NONE", "NULL", "-"].includes(text.toUpperCase()) ? text : null;
}

function isoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const text = meaningful(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function isoDateTime(value: unknown, dayFirst = false) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  const text = meaningful(value);
  if (!text) return null;
  if (dayFirst) {
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.+)$/);
    if (match) {
      const parsed = new Date(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")} ${match[4]}`);
      if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
    }
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

async function readRows(file: File, destination: ModuleKey): Promise<SourceRow[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xls") {
    if (destination !== "biometrics") throw new Error("Legacy XLS files are supported for Biometrics imports only.");
    const legacyWorkbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = legacyWorkbook.SheetNames[0];
    const worksheet = sheetName ? legacyWorkbook.Sheets[sheetName] : undefined;
    if (!worksheet) throw new Error("The file does not contain a worksheet.");
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });
    const headers = (matrix[0] ?? []).map(cleanHeader);
    return matrix.slice(1).flatMap((cells, index) => {
      const values: Record<string, unknown> = {};
      let hasValue = false;
      headers.forEach((header, column) => {
        if (!header) return;
        const value = cells[column] ?? null;
        if (value !== null && value !== "") hasValue = true;
        values[header] = value;
      });
      return hasValue ? [{ sourceRowNumber: index + 2, values }] : [];
    });
  }

  const workbook = new ExcelJS.Workbook();

  if (extension === "csv") {
    await workbook.csv.read(Readable.from(buffer.toString("utf8")));
  } else if (extension === "xlsx") {
    await workbook.xlsx.read(Readable.from(buffer));
  } else {
    throw new Error("Use an XLSX or CSV file. Biometrics also supports legacy XLS files.");
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The file does not contain a worksheet.");

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = cleanHeader(cellValue(cell.value));
  });

  const rows: SourceRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, column) => {
      if (!header) return;
      const value = cellValue(row.getCell(column).value);
      if (value !== null && value !== "") hasValue = true;
      values[header] = value;
    });
    if (hasValue) rows.push({ sourceRowNumber: rowNumber, values });
  });
  return rows;
}

function sourceValue(row: SourceRow, ...headers: string[]) {
  for (const header of headers) {
    const value = row.values[cleanHeader(header)];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function mapRow(
  module: ModuleKey,
  row: SourceRow,
  jobId: string,
  userId: string,
  departmentId: string,
) {
  if (module === "jobseekers") {
    const surname = meaningful(sourceValue(row, "SURNAME"));
    const firstName = meaningful(sourceValue(row, "FIRST NAME"));
    if (!surname || !firstName) throw new Error("Surname and first name are required.");
    return {
      department_id: departmentId,
      source_person_id: `NSRP-${row.sourceRowNumber - 1}`,
      surname,
      first_name: firstName,
      middle_name: meaningful(sourceValue(row, "MIDDLE NAME")),
      suffix: meaningful(sourceValue(row, "SUFFIX (Ex. Sr., Jr., III, etc.)")),
      birth_date: isoDate(sourceValue(row, "DATE OF BIRTH (mm/dd/yyyy)")),
      sex: meaningful(sourceValue(row, "GENDER", "SEX")),
      email: meaningful(sourceValue(row, "EMAIL ADDRESS", "EMAIL")),
      mobile_number: meaningful(sourceValue(row, "CONTACT NUMBER/S", "MOBILE NUMBER")),
      metadata: row.values,
      import_job_id: jobId,
      source_row_number: row.sourceRowNumber,
      created_by: userId,
      updated_by: userId,
    };
  }

  if (module === "research") {
    const requesterName = meaningful(sourceValue(row, "RESEARCHER/ REQUESTER NAME (First Name M.I Surname)", "REQUESTER NAME"));
    const purpose = meaningful(sourceValue(row, "RESEARCH TITLE/ PURPOSE", "RESEARCH TITLE", "PURPOSE"));
    if (!requesterName || !purpose) throw new Error("Requester name and research title or purpose are required.");
    return {
      department_id: departmentId,
      submitted_at: isoDateTime(sourceValue(row, "TIMESTAMP")),
      category: meaningful(sourceValue(row, "CATEGORY")),
      requester_name: requesterName,
      institution_office: meaningful(sourceValue(row, "SCHOOL/ INSTITUTION/ OFFICE", "INSTITUTION/OFFICE")),
      research_title_purpose: purpose,
      control_number: meaningful(sourceValue(row, "CONTROL NO.", "CONTROL NUMBER")),
      date_received: isoDate(sourceValue(row, "DATE RECEIVED")),
      import_job_id: jobId,
      source_row_number: row.sourceRowNumber,
      created_by: userId,
      updated_by: userId,
    };
  }

  const personName = meaningful(sourceValue(row, "NAME"));
  const personnelNumber = meaningful(sourceValue(row, "NO.", "NO", "PERSONNEL NUMBER"));
  const occurredAt = isoDateTime(sourceValue(row, "DATE/TIME", "DATE TIME"), true);
  if (!personName || !personnelNumber || !occurredAt) throw new Error("Name, personnel number, and a valid date/time are required.");
  return {
    department_id: departmentId,
    personnel_number: personnelNumber,
    person_name: personName,
    occurred_at: occurredAt,
    attendance_status: meaningful(sourceValue(row, "STATUS")),
    external_location_id: meaningful(sourceValue(row, "LOCATION ID")),
    employment_id_number: meaningful(sourceValue(row, "ID NUMBER")),
    workcode: meaningful(sourceValue(row, "WORKCODE")),
    verify_code: meaningful(sourceValue(row, "VERIFYCODE", "VERIFY CODE")),
    card_number: meaningful(sourceValue(row, "CARDNO", "CARD NO")),
    import_job_id: jobId,
    source_row_number: row.sourceRowNumber,
    raw_source: row.values,
    created_by: userId,
  };
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in before importing data." }, { status: 401 });

  const form = await request.formData();
  const destination = String(form.get("module") ?? "") as ModuleKey;
  const file = form.get("file");
  if (!(destination in DATASETS)) return Response.json({ error: "Choose a valid destination database." }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to import." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return Response.json({ error: "The file exceeds the 25 MB limit." }, { status: 413 });

  const { url, publishableKey } = getPublicSupabaseEnv();
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return Response.json({ error: "Your session is no longer valid. Sign in again." }, { status: 401 });

  let rows: SourceRow[];
  try {
    rows = await readRows(file, destination);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The file could not be read." }, { status: 400 });
  }
  if (rows.length === 0) return Response.json({ error: "The file does not contain any data rows." }, { status: 400 });

  const config = DATASETS[destination];
  const { data: departments, error: departmentError } = await supabase
    .schema("core")
    .from("departments")
    .select("id, code, name")
    .eq("is_active", true);
  if (departmentError) return Response.json({ error: "Departments could not be loaded." }, { status: 500 });
  const defaultDepartment = departments?.find((item) => item.code === config.department);
  if (!defaultDepartment) return Response.json({ error: "The destination department is not configured." }, { status: 500 });

  const { data: jobId, error: beginError } = await supabase.schema("core").rpc("begin_import", {
    dataset_slug: config.slug,
    source_filename: file.name,
    total_rows: rows.length,
  });
  if (beginError || !jobId) {
    return Response.json({ error: beginError?.message ?? "The import job could not be created." }, { status: 403 });
  }

  const errors: ImportError[] = [];
  const mappedRows: Record<string, unknown>[] = [];
  for (const row of rows) {
    let departmentId = defaultDepartment.id;
    if (destination === "biometrics") {
      const sourceDepartment = cleanHeader(sourceValue(row, "DEPARTMENT"));
      const match = departments?.find((item) => sourceDepartment.includes(cleanHeader(item.name)) || sourceDepartment === cleanHeader(item.code));
      if (match) departmentId = match.id;
    }
    try {
      mappedRows.push(mapRow(destination, row, jobId, authData.user.id, departmentId));
    } catch (error) {
      errors.push({
        source_row_number: row.sourceRowNumber,
        error_code: "validation_failed",
        message: error instanceof Error ? error.message : "The row is invalid.",
      });
    }
  }

  let accepted = 0;
  for (let offset = 0; offset < mappedRows.length; offset += 100) {
    const batch = mappedRows.slice(offset, offset + 100);
    const { error: batchError } = await supabase.schema(config.schema).from(config.table).insert(batch);
    if (!batchError) {
      accepted += batch.length;
      continue;
    }

    // Retry a failed batch row by row so one duplicate or malformed row does
    // not prevent the remaining valid records from being imported.
    for (const record of batch) {
      const { error } = await supabase.schema(config.schema).from(config.table).insert(record);
      if (error) {
        errors.push({
          source_row_number: Number(record.source_row_number),
          error_code: error.code || "insert_failed",
          message: error.message,
        });
      } else {
        accepted += 1;
      }
    }
  }

  const { error: completeError } = await supabase.schema("core").rpc("complete_import", {
    p_import_job_id: jobId,
    p_accepted_rows: accepted,
    p_rejected_rows: errors.length,
    p_row_errors: errors,
  });
  if (completeError) {
    await supabase.schema("core").rpc("fail_import", { p_import_job_id: jobId, p_failure_message: completeError.message });
    return Response.json({ error: completeError.message }, { status: 500 });
  }

  return Response.json({
    jobId,
    filename: file.name,
    total: rows.length,
    accepted,
    rejected: errors.length,
    errors: errors.slice(0, 10),
  });
}
