import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export function openaiError(status: number, message: string, code?: string) {
  return NextResponse.json(
    {
      error: {
        message,
        type: status === 401 ? "invalid_request_error" : "api_error",
        code: code || String(status),
      },
    },
    { status },
  );
}

export async function resolveCatalogModel(requested: string) {
  const sql = getSql();
  const id = requested.trim();
  if (!id) return null;
  const rows = await sql<
    {
      model_id: string;
      input_price_per_1m: string;
      output_price_per_1m: string;
      enabled: boolean;
    }[]
  >`
    SELECT model_id, input_price_per_1m::text, output_price_per_1m::text, enabled
    FROM model_catalog
    WHERE enabled = TRUE
      AND (
        model_id = ${id}
        OR model_id = ${"google/" + id}
        OR model_id = ${"openai/" + id}
        OR model_id = ${"deepseek/" + id}
        OR model_id = ${"anthropic/" + id}
        OR model_id = ${"bfl/" + id}
        OR model_id = ${"xai/" + id}
        OR split_part(model_id, '/', 2) = ${id}
      )
    ORDER BY
      CASE
        WHEN model_id = ${id} THEN 0
        WHEN model_id = ${"google/" + id} THEN 1
        WHEN model_id = ${"openai/" + id} THEN 2
        ELSE 3
      END
    LIMIT 1
  `;
  return rows[0] || null;
}
