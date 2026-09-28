import { test, expect } from "@playwright/test";

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible();
}
async function send(page: import("@playwright/test").Page, prompt: string) {
  await page.getByLabel("Message the spreadsheet assistant").fill(prompt);
  await page.getByRole("button", { name: "Generate proposal", exact: true }).click();
}

test("default local assistant summarizes all data without provider POST requests", async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByLabel("Assistant engine")).toHaveValue("local");
  await expect(page.getByText("Local tools ready · no credits", { exact: true })).toBeVisible();
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.getByLabel("Import spreadsheet files").setInputFiles({
    name: "Sales.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Category,Amount\nA,10\nB,5\nA,20"),
  });
  await expect(page.getByLabel("Sales!A2", { exact: true })).toHaveValue("A");
  await send(page, "Summarize this sheet");
  await expect(page.getByText("Sales — full-data profile", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").filter({ hasText: "Amount (B2:B4)" })).toContainText("35");
  await send(page, 'Sum "Amount" by "Category"');
  await expect(page.getByRole("region", { name: "Review proposed changes" })).toBeVisible();
  await expect(page.getByLabel("Sales!B2", { exact: true })).toHaveValue("10");
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(page.getByLabel("Sales Summary!B2", { exact: true })).toHaveValue("30");
  await page.getByTitle("Undo (Ctrl/Cmd+Z)").click();
  await expect(page.getByLabel("Sales Summary!B2", { exact: true })).toHaveCount(0);
  expect(posts).toEqual([]);
});

test("local cleaning requires review, leaves formula-like text inert and can undo", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Sheet1!A1", { exact: true }).fill("  Label  ");
  await page.getByLabel("Sheet1!A1", { exact: true }).press("Enter");
  await page.getByLabel("Sheet1!A2", { exact: true }).fill(" =1+1");
  await page.getByLabel("Sheet1!A2", { exact: true }).press("Enter");
  await send(page, "Trim whitespace");
  await expect(page.getByRole("region", { name: "Review proposed changes" })).toBeVisible();
  await expect(page.getByLabel("Sheet1!A1", { exact: true })).toHaveValue("  Label  ");
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(page.getByLabel("Sheet1!A1", { exact: true })).toHaveValue("Label");
  await expect(page.getByLabel("Sheet1!A2", { exact: true })).toHaveValue(" =1+1");
  await page.getByTitle("Undo (Ctrl/Cmd+Z)").click();
  await expect(page.getByLabel("Sheet1!A1", { exact: true })).toHaveValue("  Label  ");
});

test("Astra Max is explicit and gives actionable missing-access feedback without a fallback", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Assistant engine").selectOption("openai");
  await expect(page.getByLabel("AI quality")).toHaveCount(0);
  await send(page, "Create a budget workbook");
  await expect(page.getByText(/Request failed.*GPT-6 Astra Max is not connected/)).toBeVisible();
  await expect(page.getByLabel("Assistant engine")).toHaveValue("openai");
  await expect(page.getByLabel("Sheet1!A1", { exact: true })).toHaveValue("");
  await expect(page.getByRole("region", { name: "Review proposed changes" })).toHaveCount(0);
});

test("local Ollama connection sends the correct protocol and returns a reviewed edit (mock server)", async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route("http://127.0.0.1:11434/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    const body =
      path === "/api/tags"
        ? { models: [{ name: "local-test:latest", size: 100, details: { format: "gguf" } }] }
        : path === "/api/show"
          ? {
              details: { format: "gguf" },
              capabilities: ["completion"],
              model_info: { "general.architecture": "test", "test.context_length": 32768 },
            }
          : {
              model: "local-test:latest",
              done: true,
              done_reason: "stop",
              message: {
                content: JSON.stringify({
                  reply: "Review the proposed amount.",
                  operations: [
                    {
                      op: "set_cells",
                      sheet: "Sheet1",
                      cells: [
                        { a1: "A1", value: "Amount" },
                        { a1: "A2", value: "25" },
                      ],
                    },
                  ],
                }),
              },
            };
    if (path === "/api/chat") {
      const payload = route.request().postDataJSON();
      expect(payload.model).toBe("local-test:latest");
      expect(payload.stream).toBe(false);
      expect(payload.format).toBe("json");
      expect(payload.messages[1].content).toContain("WORKBOOK DATA");
    }
    await route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  });
  await ready(page);
  await page.getByLabel("Assistant engine").selectOption("ollama");
  await page.getByRole("button", { name: "Find local models", exact: true }).click();
  await page.getByRole("button", { name: "Connect local model", exact: true }).click();
  await expect(page.getByText("Local AI connected", { exact: true })).toBeVisible();
  await send(page, "Create an amount table with the value 25");
  await expect(page.getByRole("region", { name: "Review proposed changes" })).toBeVisible();
  await expect(page.getByLabel("Sheet1!A2", { exact: true })).toHaveValue("");
  await expect(page.getByText("Local AI · local-test:latest", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(page.getByLabel("Sheet1!A2", { exact: true })).toHaveValue("25");
  expect(calls).toEqual(["/api/tags", "/api/show", "/api/show", "/api/chat"]);
});

test("mobile local assistant keeps settings and summary tables within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole("button", { name: "Assistant / insights", exact: true }).click();
  await page.getByLabel("Assistant engine").selectOption("ollama");
  await page.getByText("Local AI setup", { exact: true }).last().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("Assistant engine").selectOption("local");
  await send(page, "Help");
  await expect(page.getByText("Local tools · deterministic", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
