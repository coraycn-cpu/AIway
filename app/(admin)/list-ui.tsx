"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export function buildQs(
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

type PageState = {
  page: number;
  pageSize: number;
  total: number;
};

/**
 * Paged admin list fetcher.
 * - Resets to page 1 on filter change without double-fetch
 * - Keeps previous rows while refreshing (stale-while-revalidate)
 * - Aborts/ignores outdated responses
 */
export function usePagedList<T>(
  path: string,
  filters: Record<string, string | number | boolean | null | undefined>,
  options?: { enabled?: boolean; defaultPageSize?: number },
) {
  const enabled = options?.enabled !== false;
  const defaultPageSize = options?.defaultPageSize ?? 20;
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageState>({
    page: 1,
    pageSize: defaultPageSize,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const reqId = useRef(0);
  const hasLoaded = useRef(false);
  const filterKey = JSON.stringify(filters);
  const filterKeyRef = useRef(filterKey);
  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  pageRef.current = page;
  pageSizeRef.current = pageSize;

  const load = useCallback(
    async (nextPage: number, nextSize: number, filterSnapshot: string) => {
      if (!enabled) return;
      const id = ++reqId.current;
      const isFirst = !hasLoaded.current;
      if (isFirst) setLoading(true);
      else setRefreshing(true);
      setError("");
      try {
        const parsedFilters = JSON.parse(filterSnapshot) as Record<
          string,
          string | number | boolean | null | undefined
        >;
        const qs = buildQs({
          ...parsedFilters,
          page: nextPage,
          page_size: nextSize,
        });
        const res = await fetch(`${path}${qs}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (id !== reqId.current) return;
        if (!res.ok) {
          setError(data?.error?.message || "加载失败");
          if (isFirst) setItems([]);
          return;
        }
        setItems(data.items || []);
        setMeta({
          page: Number(data.page || nextPage),
          pageSize: Number(data.page_size || nextSize),
          total: Number(data.total || 0),
        });
        hasLoaded.current = true;
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : "加载失败");
        if (isFirst) setItems([]);
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [enabled, path],
  );

  useEffect(() => {
    if (!enabled) return;
    const filterChanged = filterKeyRef.current !== filterKey;
    filterKeyRef.current = filterKey;
    let nextPage = pageRef.current;
    if (filterChanged && nextPage !== 1) {
      nextPage = 1;
      setPage(1);
    }
    void load(nextPage, pageSizeRef.current, filterKey);
  }, [enabled, path, filterKey, page, pageSize, load]);

  function changePage(next: number) {
    setPage(Math.max(1, next));
  }

  function changePageSize(next: number) {
    setPageSize(next);
    setPage(1);
  }

  return {
    items,
    loading,
    refreshing,
    busy: loading || refreshing,
    error,
    page: meta.page || page,
    pageSize: meta.pageSize || pageSize,
    total: meta.total,
    setPage: changePage,
    setPageSize: changePageSize,
    reload: () => load(pageRef.current, pageSizeRef.current, filterKeyRef.current),
  };
}

export function ListToolbar({
  children,
  onRefresh,
  loading,
  right,
}: {
  children?: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="list-toolbar">
      <div className="list-toolbar-filters">{children}</div>
      <div className="list-toolbar-actions">
        {right}
        {onRefresh ? (
          <button type="button" className="btn-secondary" disabled={loading} onClick={onRefresh}>
            {loading ? "加载中…" : "刷新"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  disabled,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={`pagination${disabled ? " is-disabled" : ""}`}>
      <div className="pagination-meta muted small">
        共 {total} 条 · 第 {from}-{to} 条 · {page}/{totalPages} 页
      </div>
      <div className="pagination-controls">
        {onPageSizeChange ? (
          <select
            aria-label="每页条数"
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}/页
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(1)}
        >
          首页
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          末页
        </button>
      </div>
    </div>
  );
}

export function EmptyTableRow({
  colSpan,
  text = "暂无数据",
}: {
  colSpan: number;
  text?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="muted" style={{ textAlign: "center", padding: 24 }}>
        {text}
      </td>
    </tr>
  );
}

export function ListTableShell({
  loading,
  refreshing,
  children,
  bare,
}: {
  loading?: boolean;
  refreshing?: boolean;
  children: ReactNode;
  /** When true, do not wrap children in .table-wrap (caller already has it). */
  bare?: boolean;
}) {
  return (
    <div
      className={`list-table-shell${loading ? " is-loading" : ""}${refreshing ? " is-refreshing" : ""}`}
    >
      {loading ? (
        <div className="list-loading-hint muted small" aria-live="polite">
          加载中…
        </div>
      ) : null}
      {refreshing && !loading ? (
        <div className="list-refresh-hint muted small" aria-live="polite">
          更新中…
        </div>
      ) : null}
      {bare ? children : <div className="table-wrap">{children}</div>}
    </div>
  );
}
