import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import { getSession } from "@/lib/session";

export const metadata = { title: "API Docs — Nookly" };

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 text-xs leading-relaxed text-zinc-100">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({
  method,
  path,
  description,
  query,
  sample,
}: {
  method: string;
  path: string;
  description: string;
  query?: { name: string; description: string }[];
  sample: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">{method}</span>
        <code className="text-sm font-semibold text-zinc-900">{path}</code>
      </div>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>

      {query && query.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Query parameters</p>
          <ul className="mt-1.5 space-y-1 text-sm text-zinc-600">
            {query.map((q) => (
              <li key={q.name}>
                <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs text-zinc-800">{q.name}</code> — {q.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Example response</p>
        <div className="mt-1.5">
          <Code>{sample}</Code>
        </div>
      </div>
    </div>
  );
}

export default async function ApiDocsPage() {
  const session = await getSession();

  return (
    <div className="flex flex-1 flex-col bg-white">
      <Nav isAuthenticated={Boolean(session)} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-bold text-zinc-900">API Reference</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Read-only export API for products, inventory, and sales — available on the Empire plan. Generate a key from{" "}
          <span className="font-medium text-zinc-700">Settings → API Access</span>.
        </p>

        <div className="mt-8 space-y-10 text-sm leading-relaxed text-zinc-700">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900">Authentication</h2>
            <p className="mt-2">
              Every request must include your API key as a bearer token. Keys are scoped to your workspace only — you
              will only ever see your own data.
            </p>
            <div className="mt-3">
              <Code>{`curl https://your-domain.example/api/public/v1/products \\
  -H "Authorization: Bearer nk_live_xxxxxxxxxxxxxxxxxxxxxxxx"`}</Code>
            </div>
            <p className="mt-3">
              A missing or invalid key returns <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">401</code>. A
              key from a workspace whose plan no longer includes API access returns{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">403</code> — this is re-checked on every
              request, so downgrading a plan revokes access immediately even if the key itself hasn&apos;t been
              revoked.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">Pagination</h2>
            <p className="mt-2">
              All list endpoints take <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">limit</code> (default
              50, max 100) and <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">cursor</code>. Each response
              includes a <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">nextCursor</code> — pass it as the{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">cursor</code> query param to fetch the next
              page; <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">null</code> means you&apos;ve reached
              the end.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Endpoints</h2>

            <Endpoint
              method="GET"
              path="/api/public/v1/products"
              description="Active products in your catalog, with per-store stock counts."
              query={[
                { name: "limit", description: "Max rows to return (default 50, max 100)." },
                { name: "cursor", description: "Product ID to resume from." },
              ]}
              sample={`{
  "data": [
    {
      "id": "clx...",
      "name": "Biogesic 500mg",
      "genericName": "Paracetamol",
      "brandName": "Biogesic",
      "barcode": "4800...",
      "sku": "BIO-500",
      "costPrice": "5.50",
      "sellingPrice": "8.00",
      "minimumStock": 20,
      "maximumStock": 200,
      "reorderPoint": 30,
      "requiresPrescription": false,
      "isOTC": true,
      "category": { "name": "Analgesics" },
      "stocks": [{ "storeId": "clx...", "currentStock": 145 }]
    }
  ],
  "nextCursor": "clx..."
}`}
            />

            <Endpoint
              method="GET"
              path="/api/public/v1/inventory"
              description="Per-store stock levels, joined with each product's active batches (batch number, expiry, quantity)."
              query={[
                { name: "limit", description: "Max rows to return (default 50, max 100)." },
                { name: "cursor", description: "Stock row ID to resume from." },
                { name: "storeId", description: "Filter to a single store." },
              ]}
              sample={`{
  "data": [
    {
      "id": "clx...",
      "storeId": "clx...",
      "currentStock": 145,
      "updatedAt": "2026-09-01T03:12:00.000Z",
      "product": {
        "id": "clx...",
        "name": "Biogesic 500mg",
        "barcode": "4800...",
        "sku": "BIO-500",
        "minimumStock": 20,
        "reorderPoint": 30,
        "batches": [
          { "batchNumber": "B-2026-014", "expirationDate": "2027-03-01T00:00:00.000Z", "quantity": 80 }
        ]
      }
    }
  ],
  "nextCursor": "clx..."
}`}
            />

            <Endpoint
              method="GET"
              path="/api/public/v1/sales"
              description="Completed and voided sales with line items."
              query={[
                { name: "limit", description: "Max rows to return (default 50, max 100)." },
                { name: "cursor", description: "Sale ID to resume from." },
                { name: "storeId", description: "Filter to a single store." },
                { name: "from", description: "ISO date — only sales on or after this date." },
                { name: "to", description: "ISO date — only sales on or before this date." },
              ]}
              sample={`{
  "data": [
    {
      "id": "clx...",
      "saleNumber": "SN-000123",
      "storeId": "clx...",
      "subtotal": "150.00",
      "taxAmount": "16.07",
      "discountAmount": "0.00",
      "totalAmount": "150.00",
      "paymentMethod": "CASH",
      "status": "COMPLETED",
      "saleDate": "2026-09-01T09:30:00.000Z",
      "items": [
        { "productId": "clx...", "quantity": 2, "unitPrice": "8.00", "totalPrice": "16.00" }
      ]
    }
  ],
  "nextCursor": "clx..."
}`}
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">Key management</h2>
            <p className="mt-2">
              You can hold up to 5 active keys per workspace. Revoking a key takes effect immediately — anything
              using it will start getting <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">401</code>{" "}
              responses right away. A revoked key cannot be reactivated; generate a new one instead.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
