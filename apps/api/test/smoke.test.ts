import { afterAll, beforeAll, expect, it } from "vitest";
import { adminClient, resetDb, type TestClient } from "./helpers.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

it("arranca la API y autentica", async () => {
  const me = await client.request("GET", "/auth/me");
  expect(me.status).toBe(200);
  expect(me.body.username).toBe("admin-test");
});
