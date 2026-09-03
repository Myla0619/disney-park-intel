/**
 * 路由层的统一校验与错误响应
 */

import { NextResponse } from "next/server";
import { z } from "zod";

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

function badRequest(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "请求参数不合法",
      // 带上字段路径，前端能直接定位是哪个输入有问题
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    },
    { status: 400 }
  );
}

export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<Parsed<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 }) };
  }

  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, response: badRequest(result.error) };
}

export function parseQuery<T extends z.ZodType>(url: URL, schema: T): Parsed<z.infer<T>> {
  const raw = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, response: badRequest(result.error) };
}
