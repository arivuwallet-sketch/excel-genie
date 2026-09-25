import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { toPbiTables, assertPbiSchema } from "./powerbi-data";
import { MAX_ROWS, MAX_COLS, MAX_CELL_LENGTH, MAX_SHEETS } from "./workbook-limits";

/**
 * Pushes the current workbook into a Power BI "push dataset" via the real Power BI REST API —
 * this is genuine Microsoft Power BI, not a lookalike. It needs an Azure AD app registration with
 * access to a Power BI workspace; see the setup notes at the bottom of this file. Until those four
 * environment variables are set, this throws a clear configuration error rather than pretending to
 * work — there is no way to exercise the real API without real tenant credentials.
 */

const RequestSchema = z.object({
  sheets: z
    .array(
      z.object({
        name: z.string().min(1).max(31),
        rows: z.array(z.array(z.string().max(MAX_CELL_LENGTH)).max(MAX_COLS)).max(MAX_ROWS),
      }),
    )
    .min(1)
    .max(MAX_SHEETS),
});

const TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const API_ROOT = "https://api.powerbi.com/v1.0/myorg";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Power BI is not configured (missing ${name}). See the setup notes in src/lib/powerbi.server.ts.`,
    );
  }
  return v;
}

/** OAuth2 client-credentials flow against Azure AD — standard for a service-to-service push, no user sign-in. */
async function getAccessToken(): Promise<string> {
  const tenantId = requireEnv("POWERBI_TENANT_ID");
  const clientId = requireEnv("POWERBI_CLIENT_ID");
  const clientSecret = requireEnv("POWERBI_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://analysis.windows.net/powerbi/api/.default",
  });

  const res = await fetch(TOKEN_URL(tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Azure AD token request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Azure AD did not return an access token.");
  return data.access_token;
}

async function pbiFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Power BI API ${init?.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`,
    );
  }
  return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
}

export const pushToPowerBi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RequestSchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ datasetName: string; tablesPushed: number; rowsPushed: number }> => {
      const workspaceId = requireEnv("POWERBI_WORKSPACE_ID");
      const datasetName = process.env["POWERBI_DATASET_NAME"] || "SheetSmith Export";
      const tables = toPbiTables(data.sheets);
      if (tables.length === 0) throw new Error("Nothing to push — every sheet is empty.");

      const token = await getAccessToken();

      // Reuse an existing dataset with this name in the workspace if one exists, else create it.
      const existing = (await pbiFetch(token, `/groups/${workspaceId}/datasets`)) as {
        value?: { id: string; name: string }[];
      };
      let datasetId = existing.value?.find((d) => d.name === datasetName)?.id;

      if (!datasetId) {
        const created = (await pbiFetch(token, `/groups/${workspaceId}/datasets`, {
          method: "POST",
          body: JSON.stringify({
            name: datasetName,
            defaultMode: "Push",
            tables: tables.map((t) => ({ name: t.sanitized, columns: t.columns })),
          }),
        })) as { id: string };
        if (!created?.id) throw new Error("Power BI did not return a dataset ID.");
        datasetId = created.id;
      } else {
        const schema = (await pbiFetch(
          token,
          `/groups/${workspaceId}/datasets/${datasetId}/tables`,
        )) as { value?: { name: string; columns: { name: string; dataType: string }[] }[] };
        assertPbiSchema(tables, schema?.value ?? []);
      }

      let rowsPushed = 0;
      for (const table of tables) {
        // Clear then re-push, so re-running this after edits always reflects the current workbook.
        await pbiFetch(
          token,
          `/groups/${workspaceId}/datasets/${datasetId}/tables/${encodeURIComponent(table.sanitized)}/rows`,
          {
            method: "DELETE",
          },
        ); // Abort on failure: appending after a failed clear would duplicate data.
        if (table.rows.length === 0) continue;
        // Power BI accepts at most 10,000 rows per call; chunk defensively.
        for (let i = 0; i < table.rows.length; i += 5000) {
          const chunk = table.rows.slice(i, i + 5000);
          await pbiFetch(
            token,
            `/groups/${workspaceId}/datasets/${datasetId}/tables/${encodeURIComponent(table.sanitized)}/rows`,
            {
              method: "POST",
              body: JSON.stringify({ rows: chunk }),
            },
          );
          rowsPushed += chunk.length;
        }
      }

      return { datasetName, tablesPushed: tables.length, rowsPushed };
    },
  );

/**
 * SETUP (one-time, in your Azure/Power BI tenant — I can't create these for you):
 * 1. Azure Portal -> Microsoft Entra ID -> App registrations -> New registration.
 * 2. On the app: Certificates & secrets -> New client secret. Copy the secret value immediately.
 * 3. Copy the app's Application (client) ID and Directory (tenant) ID from its Overview page.
 * 4. In Power BI (app.powerbi.com) -> the target Workspace -> Workspace settings -> add the app
 *    (search by its client ID) as a member with Contributor access, or enable
 *    "Allow service principals to use Power BI APIs" in the Fabric admin portal for your tenant.
 * 5. Copy the Workspace ID from the workspace's URL (the GUID after /groups/).
 * 6. Set these as secrets in Lovable (Cloud -> Settings -> Secrets) so they reach process.env here:
 *    POWERBI_TENANT_ID, POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET, POWERBI_WORKSPACE_ID
 *    (POWERBI_DATASET_NAME is optional — defaults to "SheetSmith Export").
 * Once set, calling pushToPowerBi creates (once) or reuses a push dataset named after
 * POWERBI_DATASET_NAME, with one Power BI table per sheet, and re-pushes current rows each call.
 */
