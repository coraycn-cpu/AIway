import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

/** Raw markdown for other Cursor agents / tools to fetch. */
export async function GET() {
  const file = join(process.cwd(), "docs/BUSINESS-SITE-INTEGRATION.md");
  const body = readFileSync(file, "utf8");
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
