import { afterAll, beforeAll, expect, it } from "vitest";
import { adminClient, createStudent, prisma, resetDb, type TestClient } from "./helpers.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

function multipart(file: Buffer, filename: string) {
  const boundary = "----finbandtest";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      "Content-Type: application/octet-stream\r\n\r\n",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

it("la base trabaja en modo WAL", async () => {
  const [row] = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>("PRAGMA journal_mode");
  expect(row?.journal_mode).toBe("wal");
});

it("descarga una copia coherente y la restaura", { timeout: 60_000 }, async () => {
  await createStudent({ firstName: "Antes", lastName: "DeLaCopia" });

  const download = await client.app.inject({
    method: "GET",
    url: "/api/v1/admin/backup/database",
    cookies: { finband_token: client.token },
  });
  expect(download.statusCode).toBe(200);
  const backup = download.rawPayload;
  expect(backup.subarray(0, 15).toString()).toBe("SQLite format 3");

  await createStudent({ firstName: "Despues", lastName: "DeLaCopia" });
  expect(await prisma.student.count({ where: { lastName: "DeLaCopia" } })).toBe(2);

  const restore = await client.app.inject({
    method: "POST",
    url: "/api/v1/admin/backup/restore",
    cookies: { finband_token: client.token },
    ...multipart(backup, "copia.sqlite"),
  });
  expect(restore.statusCode, restore.body).toBe(200);
  expect(await prisma.student.count({ where: { lastName: "DeLaCopia" } })).toBe(1);

  const [row] = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>("PRAGMA journal_mode");
  expect(row?.journal_mode).toBe("wal");
  expect(await prisma.auditLog.count({ where: { action: "RESTORE" } })).toBe(1);
});

it("rechaza un fichero que no es SQLite", async () => {
  const res = await client.app.inject({
    method: "POST",
    url: "/api/v1/admin/backup/restore",
    cookies: { finband_token: client.token },
    ...multipart(Buffer.from("esto no es una base de datos, solo texto"), "x.sqlite"),
  });
  expect(res.statusCode).toBe(400);
});
