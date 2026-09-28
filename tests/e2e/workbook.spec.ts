import { test, expect } from "@playwright/test";

test("missing AI configuration has actionable feedback and preserves the workbook", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible();
  await page.getByLabel("Assistant engine").selectOption("lovable");
  await page.getByLabel("Message the spreadsheet assistant").fill("Create a budget workbook");
  await page.getByRole("button", { name: "Generate proposal", exact: true }).click();
  await expect(
    page.getByText(/Request failed.*Lovable AI is not connected for this deployment/),
  ).toBeVisible();
  await expect(page.getByLabel("Sheet1!A1", { exact: true })).toHaveValue("");
  await expect(page.getByRole("region", { name: "Review proposed changes" })).toHaveCount(0);
});

test("empty reconciliation gives a useful prerequisite instead of a failed AI proposal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "ExcelGPT", exact: true })).toBeVisible();
  await page
    .getByLabel("Message the spreadsheet assistant")
    .fill("Reconcile Sheet A and Sheet B and flag unmatched items");
  await page.getByRole("button", { name: "Generate proposal", exact: true }).click();
  await expect(page.getByText(/Upload or create both source sheets first/)).toBeVisible();
  await expect(page.getByText("Request failed.", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("real CSV upload, reconciliation preview, apply, undo and XLSX export", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible();
  await page.getByLabel("Import spreadsheet files").setInputFiles([
    {
      name: "Ledger.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("ID,Amount\nA,100\nB,50\nC,20"),
    },
    { name: "Bank.csv", mimeType: "text/csv", buffer: Buffer.from("ID,Amount\nA,100\nB,40\nD,20") },
  ]);
  await expect(page.getByLabel("Ledger!A2", { exact: true })).toHaveValue("A");
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByLabel("Left source").selectOption("0");
  await page.getByLabel("Right source").selectOption("1");
  await page.getByRole("button", { name: "Preview result", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review proposed changes" })).toBeVisible();
  await expect(page.getByLabel("Ledger!A2", { exact: true })).toHaveValue("A");
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(page.getByLabel("Reconciliation!A2", { exact: true })).toHaveValue("Matched");
  await expect(page.getByLabel("Reconciliation!A3", { exact: true })).toHaveValue("Variance");
  await expect(page.getByLabel("Reconciliation!G3", { exact: true })).toHaveValue("10");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download plain .xlsx", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("excelgpt.xlsx");
  await page.getByTitle("Undo (Ctrl/Cmd+Z)").click();
  await expect(page.getByLabel("Reconciliation!A2", { exact: true })).toHaveCount(0);
});

test("calculation worker and values copy preserve original formula", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible();
  await page.getByLabel("Sheet1!A1", { exact: true }).fill("10");
  await page.getByLabel("Sheet1!A1", { exact: true }).press("Enter");
  await page.getByLabel("Sheet1!B1", { exact: true }).fill("=A1*2");
  await page.getByLabel("Sheet1!B1", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByText("1 formulas checked · 0 calculation errors across the workbook"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview values copy of Sheet1", exact: true }).click();
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(page.getByLabel("Sheet1 Values!B1", { exact: true })).toHaveValue("20");
  await page.getByText("Sheet1", { exact: true }).click();
  await expect(page.getByLabel("Sheet1!B1", { exact: true })).toHaveValue("=A1*2");
  expect(errors).toEqual([]);
});

test("mobile workflows and unsupported calculations remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByRole("button", { name: "Generate test data", exact: true }).click();
  await page.getByLabel("Data rows").fill("5");
  await page.getByRole("button", { name: "Preview result", exact: true }).click();
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(page.getByLabel("Synthetic test data!A2", { exact: true })).toHaveValue(
    "TEST-000001",
  );
  await page.getByLabel("Synthetic test data!B2", { exact: true }).fill("=XLOOKUP(1,A1:A5,B1:B5)");
  await page.getByLabel("Synthetic test data!B2", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.getByText(/Resolve these errors before creating a values copy/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Preview values copy/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
