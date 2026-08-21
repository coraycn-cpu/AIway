import { NextResponse } from "next/server";
import { resolveCatalogModel, listEnabledCatalogModels } from "@/lib/catalog";

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

export { resolveCatalogModel, listEnabledCatalogModels };
