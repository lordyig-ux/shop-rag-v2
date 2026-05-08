# shop-rag

Local LAN knowledge-base dashboard for an autobody shop. Qdrant stays local for retrieval; OpenAI is used only to write answers from the retrieved chunks sent in the prompt.

## What It Provides

- Staff Q&A dashboard at `/`
- Admin dashboard at `/admin` with basic-auth login
- Source browser at `/sources`
- Health endpoint at `/health` and `/api/health`
- Qdrant collection/schema inspection
- Modular retrieval with keyword fallback when embedding compatibility is unknown
- Cited answers with excerpts and low-evidence warnings

## Windows 11 Setup

### 1. Install Python

Install Python 3.11 or newer from [python.org](https://www.python.org/downloads/windows/). During install, enable **Add python.exe to PATH**.

Check PowerShell:

```powershell
python --version
```

### 2. Create A Virtual Environment

```powershell
cd C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 3. Install Requirements

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Run Or Connect To Qdrant

If Qdrant is already running on the office PC, set `QDRANT_URL` in `.env`.

Default:

```env
QDRANT_URL=http://127.0.0.1:6333
```

With Docker Desktop:

```powershell
docker volume create qdrant_storage
docker run -d --name qdrant -p 127.0.0.1:6333:6333 -p 127.0.0.1:6334:6334 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

The app does not upload the full database to OpenAI.

### 5. Configure Environment

```powershell
copy .env.example .env
notepad .env
```

Set:

```env
OPENAI_API_KEY=your-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=a-real-local-password
```

For local Ollama testing instead of OpenAI:

```env
ANSWER_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:1b
OLLAMA_API_KEY=
```

Then install Ollama, run `ollama run llama3.2:1b "hello"`, and leave Ollama running in the background.

For Ollama Cloud through the local Ollama app, sign in and pull a cloud model:

```powershell
ollama signin
ollama pull gpt-oss:120b-cloud
ollama run gpt-oss:120b-cloud "Say hello in one sentence."
```

Then set:

```env
ANSWER_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gpt-oss:120b-cloud
OLLAMA_API_KEY=
```

For direct Ollama Cloud API access with an API key, set:

```env
ANSWER_PROVIDER=ollama
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gpt-oss:120b
OLLAMA_API_KEY=your-ollama-api-key
```

Do not commit or share `.env`; it contains secrets. The app reports whether an Ollama API key is present without exposing the key.

If `QDRANT_COLLECTION` is blank, the admin dashboard lists available collections and the query path uses the first available collection.

If you know the exact embedding model used by the Qdrant collection, set:

```env
QUERY_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

Leave it blank when embedding compatibility is unknown; keyword fallback will be used.

### 6. Inspect Qdrant First

```powershell
python scripts\inspect_qdrant.py
```

This writes:

```text
QDRANT_INSPECTION_REPORT.md
```

The report lists collections, vector dimensions, distance metrics, point counts, payload fields, likely text/title/source fields, timestamps, metadata, and embedding compatibility risk.

### 7. Import The Existing ICBC Chunks Into Qdrant

If Qdrant is running but the dashboard says no collections are present, import the scraped ICBC chunks:

```powershell
python scripts\import_chunks_to_qdrant.py
```

The first run downloads the local embedding model `all-MiniLM-L6-v2`. When it finishes, set these values in `.env`:

```env
QDRANT_COLLECTION=icbc_procedures
QUERY_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

To replace that collection later, run:

```powershell
python scripts\import_chunks_to_qdrant.py --recreate
```

### 8. Run The App

```powershell
.\scripts\run_windows.ps1
```

Equivalent command:

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Production Windows Service

For production, do not rely on double-clicking `launch.bat`. Use the production bundle installer so `shop-rag` is installed as a Windows service and starts after a server reboot without anyone logging in.

## Simplified Production Install

Build one production zip from the development machine:

```powershell
cd C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag
.\scripts\build_production_bundle.ps1
```

This creates a zip in:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\dist
```

Copy the newest `TerminalAutobody-ShopRag-Production-*.zip` file to the production server, extract it, then right-click:

```text
Install-ShopRag.bat
```

Choose **Run as administrator**.

The installer asks for:

- shop-rag admin password
- Ollama API key

Then it automatically:

- copies the app to `C:\TerminalAutobody\ShopRag`
- creates `.venv`
- installs Python requirements
- creates/updates `.env`
- starts or creates the Qdrant Docker container
- imports the included ICBC chunks if Qdrant is empty
- imports included shop docs if present
- installs the `ShopRag` Windows service
- opens Windows Firewall for port `8000`
- runs a health check
- prints the local and LAN dashboard URLs

Production backup helpers are included in the same installer folder:

```text
Backup-ShopRag.bat
Restore-ShopRag.bat
Uninstall-ShopRag.bat
```

The production server must already have:

- Windows 11 or Windows Server
- Python 3.11 or newer
- Docker Desktop
- internet access for Ollama Cloud and first-time Python/model downloads

### Manual Service Setup

The simplified installer above is preferred. Use the manual service steps below only for troubleshooting or custom installs.

The service scripts use NSSM, a small Windows service wrapper.

### 1. Install NSSM

Download NSSM from:

```text
https://nssm.cc/download
```

Extract the download, then copy the 64-bit executable to:

```text
shop-rag\tools\nssm\nssm.exe
```

The final path should look like:

```text
C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag\tools\nssm\nssm.exe
```

### 2. Confirm Qdrant Starts Automatically

If Qdrant is running in Docker, set the container restart policy:

```powershell
docker update --restart unless-stopped qdrant
```

Then restart the server once and verify Qdrant comes back:

```powershell
Invoke-RestMethod http://127.0.0.1:6333/collections
```

The `shop-rag` service installer adds a dependency on Docker Desktop's Windows service when it exists, but Qdrant still needs its own restart policy or service setup.

### 3. Install The shop-rag Service

Open PowerShell **as Administrator**:

```powershell
cd C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag
.\scripts\install_service.ps1
```

This creates a Windows service named:

```text
ShopRag
```

The service runs:

```text
scripts\run_service.ps1
```

That script starts Uvicorn from `.venv`, reads `.env`, and binds to the configured `APP_HOST` and `APP_PORT`.

### 4. Service Commands

Run these from an Administrator PowerShell:

```powershell
.\scripts\service_status.ps1
.\scripts\start_service.ps1
.\scripts\stop_service.ps1
.\scripts\uninstall_service.ps1
```

Service logs are written to:

```text
data\logs\service-output.log
data\logs\service-error.log
```

### 5. Verify After Reboot

Restart the production server. Without logging in as a normal user, check from another shop computer:

```text
http://SERVER-IP:8000
```

If the page does not load, log into the server and run:

```powershell
cd C:\DOCUMENTS\00_CLAUDE\ICBC_Scraper\shop-rag
.\scripts\service_status.ps1
Get-Content .\data\logs\service-error.log -Tail 50
```

### 9. Find The Windows PC IP Address

```powershell
ipconfig
```

Look for the IPv4 address on the active Ethernet or Wi-Fi adapter, for example:

```text
192.168.1.50
```

### 10. Open Windows Firewall For Port 8000

Run PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "shop-rag FastAPI 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

### 11. Open From Another Shop Computer

From a browser on the same LAN:

```text
http://192.168.1.50:8000
```

Use your actual PC IP address.

## API

```text
GET  /health
GET  /api/health
GET  /api/admin/qdrant
GET  /api/admin/collections
GET  /api/admin/schema
POST /api/query
GET  /api/sources
GET  /api/sources/{source_id}
POST /api/admin/test-query
```

Admin API routes require HTTP Basic auth using `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Smoke Test

```powershell
python scripts\smoke_test.py
```

Some Qdrant checks fail until Qdrant is running and reachable. The app still starts and shows health warnings.

## Retrieval Notes

Vector search is only enabled when `QUERY_EMBEDDING_MODEL` is configured. This avoids silently querying vectors with the wrong embedding model.

When the embedding model is unknown, the app uses Qdrant payload scanning and keyword scoring as a fallback. It is less precise than compatible vector search but safer than pretending mismatched vectors are reliable.

## Admin Knowledge Maintenance

Open `/admin` and use **Knowledge Base Tools**. These tools require the admin login.

ICBC maintenance:

- **Check ICBC Updates** fetches the latest ICBC navigation map and compares it to the indexed ICBC source catalog.
- **Run Full ICBC Refresh** re-runs the scraper pipeline, rebuilds chunks, imports a staging Qdrant collection, then promotes the refreshed ICBC collection after the staging import succeeds.
- The admin page shows last checked, last refreshed, and next recommended monthly check dates.

Shop-doc ingestion:

- Put documents in `data\shop_docs\inbox`.
- The folder is the source of truth. To remove a shop document from search, remove it from the inbox and import again.
- Subfolders are supported. This is used for crawled source sets such as `data\shop_docs\inbox\mitchell_ceg`.
- Supported v1 formats: `.pdf` with selectable text, `.docx`, `.xlsx`, `.txt`, `.md`, `.html`, `.htm`, and `urls.txt`.
- Excel import reads visible `.xlsx` sheets only and converts non-empty rows into searchable text with workbook, sheet, and row context.
- `urls.txt` should contain one `http://` or `https://` URL per line.

Mitchell CEG:

- **Refresh Mitchell CEG** crawls the approved Mitchell CEG Procedure Explanations folder starting at `https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020000.htm`.
- The crawler only follows `ceg*.htm` pages inside the same CEG content folder.
- It saves pages and source metadata under `data\shop_docs\inbox\mitchell_ceg`, then rebuilds `shop_docs_v1`.
- Use this only when your shop is permitted to use Mitchell CEG content internally.

Background jobs:

- Only one admin maintenance job can run at a time.
- Jobs run in the background.
- The admin page shows current status, current step, recent log lines, and success/failure.

Source index:

- The admin source index is a SQLite catalog of indexed URLs and documents.
- It supports server-side search, pagination, and filters through the admin API.
- Qdrant remains the vector database; SQLite is only the admin catalog of indexed sources.

## Future Shop Docs

The app supports a second collection, `shop_docs_v1`, for SOPs, OEM procedures, vendor docs, HR policies, estimating guides, parts notes, and paint process documents. The intended search modes are:

- ICBC only
- Shop docs only
- All knowledge
