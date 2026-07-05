// Server-only helpers for Google Drive via Lovable connector gateway.
// NEVER import from client code.

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const UPLOAD_GATEWAY = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Google Drive não está conectado (LOVABLE_API_KEY ou GOOGLE_DRIVE_API_KEY ausente)");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

async function driveFetch(path: string, init: RequestInit = {}, base = GATEWAY): Promise<Response> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401 || res.status === 403) {
     console.error("Google Drive Auth Error:", res.status, await res.clone().text());
  }
  return res;
}

const SHARED_DRIVE_PARAMS = "supportsAllDrives=true&includeItemsFromAllDrives=true";

async function findFolderByAppProperty(key: string, value: string): Promise<string | null> {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='${key}' and value='${value}' }`
  );
  const res = await driveFetch(`/files?q=${q}&fields=files(id)&corpora=allDrives&${SHARED_DRIVE_PARAMS}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { files?: Array<{ id: string }> };
  return json.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string | null, appProperties: Record<string, string>): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    appProperties,
  };
  if (parentId) body.parents = [parentId];
  const res = await driveFetch(`/files?fields=id&${SHARED_DRIVE_PARAMS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Falha ao criar pasta no Drive: ${res.status} ${await res.text()}`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}


export async function ensureOrgFolder(orgId: string, orgName: string): Promise<string> {
  const existing = await findFolderByAppProperty("lovableOrgId", orgId);
  if (existing) return existing;
  return createFolder(`AP - ${orgName} (${orgId.slice(0, 8)})`, null, { lovableOrgId: orgId });
}

export async function ensureCompanyFolder(orgFolderId: string | null, companyId: string, companyName: string): Promise<string> {
  const existing = await findFolderByAppProperty("lovableCompanyId", companyId);
  if (existing) return existing;
  return createFolder(`AP - ${companyName}`, orgFolderId, { lovableCompanyId: companyId });
}

export async function ensureDocTypeFolder(parentFolderId: string, scopeKey: string, docTypeName: string): Promise<string> {
  // scopeKey is unique per (company, docType) pair, e.g. `${companyId}:${docTypeId}`.
  const existing = await findFolderByAppProperty("lovableDocTypeScope", scopeKey);
  if (existing) return existing;
  return createFolder(docTypeName, parentFolderId, { lovableDocTypeScope: scopeKey });
}

export interface DriveUploadResult {
  id: string;
  webViewLink?: string;
}

export async function uploadFileToDrive(params: {
  folderId: string;
  filename: string;
  mimeType: string;
  body: ArrayBuffer | Uint8Array;
  appProperties?: Record<string, string>;
}): Promise<DriveUploadResult> {
  const boundary = `----lovable_${crypto.randomUUID()}`;
  const metadata = {
    name: params.filename,
    parents: [params.folderId],
    mimeType: params.mimeType,
    appProperties: params.appProperties ?? {},
  };
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const fileBytes = params.body instanceof Uint8Array ? params.body : new Uint8Array(params.body);
  const body = new Uint8Array(head.length + fileBytes.length + tail.length);
  body.set(head, 0);
  body.set(fileBytes, head.length);
  body.set(tail, head.length + fileBytes.length);

  const res = await driveFetch(
    `/files?uploadType=multipart&fields=id,webViewLink&${SHARED_DRIVE_PARAMS}`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
    UPLOAD_GATEWAY
  );
  if (!res.ok) {
    throw new Error(`Falha no upload para o Drive: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as DriveUploadResult;
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const res = await driveFetch(`/files/${fileId}?${SHARED_DRIVE_PARAMS}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Falha ao deletar do Drive: ${res.status} ${await res.text()}`);
  }
}

export async function streamDriveFile(fileId: string): Promise<Response> {
  return driveFetch(`/files/${fileId}?alt=media&${SHARED_DRIVE_PARAMS}`);

}
